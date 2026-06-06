import { useMutation } from '@tanstack/react-query';
import { sendMessageStream, type Attachment } from '../api/navis';
import { useChatStore } from '../store/chat-store';
import { useUiStore } from '../store/ui-store';
import { localAgent, hasLocalAgent } from '../lib/local-agent';
import { makeId } from '../lib/id';
import { notify, isWindowHidden } from '../lib/notify';

type SendVars = {
  text: string;
  conversationId: string;
  attachments?: Attachment[];
  // 데스크톱 로컬 에이전트로 보낼지 (내 맥 파일/터미널). 채팅 호출 시점에 결정.
  local?: boolean;
  // 코드 세션 멀티턴 — 이어갈 SDK 세션 id(로컬 에이전트 전용).
  resume?: string;
};

// 메시지 전송 = TanStack Query mutation. 대화방(conversationId) 단위로 동작해
// 각 방이 독립 세션·typing 상태를 가진다. 응답은 토큰 스트리밍으로 받아 점진 표시한다.
export function useSendMessage() {
  const mutation = useMutation({
    mutationFn: async ({ text, conversationId, attachments, local, resume }: SendVars) => {
      const {
        conversations,
        addMessage,
        appendMessageText,
        setMessageText,
        setTyping,
      } = useChatStore.getState();
      const conv = conversations.find((c) => c.id === conversationId);

      // 응답 말풍선은 첫 델타가 올 때 생성(그 전까진 typing 점 표시).
      const assistantId = makeId('a');
      let started = false;
      const ensureBubble = () => {
        if (started) return;
        started = true;
        setTyping(conversationId, false);
        addMessage(conversationId, {
          id: assistantId,
          role: 'assistant',
          text: '',
          createdAt: new Date().toISOString(),
        });
      };

      // 로컬 모드/코드 세션: 데스크톱 로컬 에이전트(내 맥 파일/터미널)로 실행. 서버 navis 안 거침.
      if (local && localAgent) {
        const res = await localAgent.run(text, {
          resume,
          onDelta: (delta) => {
            ensureBubble();
            appendMessageText(conversationId, assistantId, delta);
          },
        });
        const replyText = res.error ? `⚠️ 로컬 에이전트: ${res.error}` : res.text ?? '(빈 응답)';
        if (!started) {
          addMessage(conversationId, {
            id: assistantId,
            role: 'assistant',
            text: replyText,
            createdAt: new Date().toISOString(),
          });
        } else {
          setMessageText(conversationId, assistantId, replyText);
        }
        // 코드 세션만 SDK 세션 id 를 저장해 다음 턴에 이어간다(멀티턴).
        // 일반 'chat' 의 localMode 는 서버 세션 네임스페이스와 섞이지 않게 저장 안 함.
        const isCode = conv?.kind === 'code';
        return {
          reply: { text: replyText, createdAt: new Date().toISOString() },
          sessionId: isCode ? res.sessionId : undefined,
          contextFull: false,
          saved: false,
        };
      }

      // 일시적 연결 실패(Railway 콜드스타트·네트워크 블립)는 사용자에게 에러를
      // 띄우기 전에 조용히 몇 번 재시도한다. 단, 델타가 한 번이라도 도착한 뒤(스트림
      // 시작됨)의 실패는 재시도하면 본문이 중복되므로 그대로 올려보낸다.
      const MAX_ATTEMPTS = 3;
      let result: Awaited<ReturnType<typeof sendMessageStream>> | undefined;
      for (let attempt = 1; ; attempt++) {
        try {
          result = await sendMessageStream(
            text,
            conv?.sessionId,
            attachments,
            (delta) => {
              ensureBubble();
              appendMessageText(conversationId, assistantId, delta);
            },
          );
          break;
        } catch (err) {
          if (started || attempt >= MAX_ATTEMPTS) throw err;
          // 점증 백오프(0.7s → 1.4s)로 잠깐 쉬었다가 재시도.
          await new Promise((r) => setTimeout(r, attempt * 700));
        }
      }

      // 델타가 한 번도 안 왔으면 지금 생성, 왔으면 권위 텍스트로 보정.
      if (!started) {
        addMessage(conversationId, {
          id: assistantId,
          role: 'assistant',
          text: result.reply.text,
          createdAt: result.reply.createdAt,
        });
      } else {
        setMessageText(conversationId, assistantId, result.reply.text);
      }

      return result;
    },
    onMutate: ({ text, conversationId, attachments }) => {
      const { addMessage, setTyping } = useChatStore.getState();
      const userMessageId = makeId('u');
      addMessage(conversationId, {
        id: userMessageId,
        role: 'user',
        text,
        createdAt: new Date().toISOString(),
        images: attachments?.map((a) => a.uri),
      });
      setTyping(conversationId, true);
      // onSuccess 에서 💡 부착에 쓸 유저 메시지 id 를 context 로 넘김
      return { userMessageId };
    },
    onSuccess: ({ sessionId, contextFull, saved, reply }, { conversationId }, context) => {
      const { setSessionId, toggleReaction } = useChatStore.getState();
      setSessionId(conversationId, sessionId && !contextFull ? sessionId : undefined);
      // 저장됐으면 유저 메시지에 💡
      if (saved && context?.userMessageId) {
        toggleReaction(conversationId, context.userMessageId, '💡');
      }
      // 포그라운드에서 같은 방을 보고 있지 않으면 네이티브 알림 (use-reports.ts 패턴과 동일).
      const watching =
        !isWindowHidden() && useChatStore.getState().activeId === conversationId;
      if (!watching && reply?.text) {
        notify('나비스', reply.text.replace(/\s+/g, ' ').trim().slice(0, 140), () => {
          useUiStore.getState().setScreen('chat');
          useChatStore.getState().selectConversation(conversationId);
        });
      }
    },
    onError: (_err, { conversationId }) => {
      useChatStore.getState().addMessage(conversationId, {
        id: makeId('a'),
        role: 'assistant',
        text: '⚠️ 나비스 서버에 연결하지 못했어요 (자동 재시도 후에도 실패했어요). 잠시 후 다시 보내주세요.',
        createdAt: new Date().toISOString(),
      });
    },
    onSettled: (_data, _err, { conversationId }) => {
      useChatStore.getState().setTyping(conversationId, false);
    },
  });

  // 현재 활성 대화방으로 전송. 코드 세션은 항상 로컬 에이전트로(+세션 이어가기),
  // 일반 대화는 로컬 모드 ON + 데스크톱일 때만 로컬 실행.
  const send = (text: string, attachments?: Attachment[]) => {
    const { activeId, conversations } = useChatStore.getState();
    const active = conversations.find((c) => c.id === activeId);
    const isCode = active?.kind === 'code';
    const local = hasLocalAgent && (isCode || useUiStore.getState().localMode);
    const resume = isCode ? active?.sessionId : undefined;
    mutation.mutate({ text, conversationId: activeId, attachments, local, resume });
  };

  return { send };
}
