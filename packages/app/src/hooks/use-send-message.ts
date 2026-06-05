import { useMutation } from '@tanstack/react-query';
import { sendMessageStream, type Attachment } from '../api/navis';
import { useChatStore } from '../store/chat-store';
import { makeId } from '../lib/id';

type SendVars = { text: string; conversationId: string; attachments?: Attachment[] };

// 메시지 전송 = TanStack Query mutation. 대화방(conversationId) 단위로 동작해
// 각 방이 독립 세션·typing 상태를 가진다. 응답은 토큰 스트리밍으로 받아 점진 표시한다.
export function useSendMessage() {
  const mutation = useMutation({
    mutationFn: async ({ text, conversationId, attachments }: SendVars) => {
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

      const result = await sendMessageStream(
        text,
        conv?.sessionId,
        attachments,
        (delta) => {
          ensureBubble();
          appendMessageText(conversationId, assistantId, delta);
        },
      );

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
    onSuccess: ({ sessionId, contextFull, saved }, { conversationId }, context) => {
      const { setSessionId, toggleReaction } = useChatStore.getState();
      setSessionId(conversationId, sessionId && !contextFull ? sessionId : undefined);
      // 저장됐으면 유저 메시지에 💡
      if (saved && context?.userMessageId) {
        toggleReaction(conversationId, context.userMessageId, '💡');
      }
    },
    onError: (_err, { conversationId }) => {
      useChatStore.getState().addMessage(conversationId, {
        id: makeId('a'),
        role: 'assistant',
        text: '⚠️ 나비스 서버에 연결하지 못했어. 잠시 후 다시 시도해줘.',
        createdAt: new Date().toISOString(),
      });
    },
    onSettled: (_data, _err, { conversationId }) => {
      useChatStore.getState().setTyping(conversationId, false);
    },
  });

  // 현재 활성 대화방으로 전송
  const send = (text: string, attachments?: Attachment[]) => {
    const { activeId } = useChatStore.getState();
    mutation.mutate({ text, conversationId: activeId, attachments });
  };

  return { send };
}
