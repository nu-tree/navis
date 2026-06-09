import { useMutation } from "@tanstack/react-query";
import { sendMessageStream, type Attachment } from "../api/navis";
import { fetchNamoryMcp } from "../api/agent";
import { useChatStore } from "../store/chat-store";
import { useUiStore } from "../store/ui-store";
import { localAgent, hasLocalAgent, type NamoryMcp } from "../lib/local-agent";
import { makeId } from "../lib/id";
import { notify, isWindowHidden } from "../lib/notify";
import { TextAnimator } from "../lib/text-animator";

type SendVars = {
  text: string;
  conversationId: string;
  attachments?: Attachment[];
  // 데스크톱 로컬 에이전트로 보낼지 (내 맥 파일/터미널). 채팅 호출 시점에 결정.
  local?: boolean;
  // 코드 세션 멀티턴 — 이어갈 SDK 세션 id(로컬 에이전트 전용).
  resume?: string;
  // 코드 세션의 작업 폴더(세션별) — 로컬 에이전트가 이 폴더에서 돈다.
  workdir?: string;
  // 코드 세션 기억 연결 — namory MCP 좌표(있으면 recall/save 도구 연결).
  namory?: NamoryMcp | null;
};

// 메시지 전송 = TanStack Query mutation. 대화방(conversationId) 단위로 동작해
// 각 방이 독립 세션·typing 상태를 가진다. 응답은 토큰 스트리밍으로 받아 점진 표시한다.
export function useSendMessage() {
  const mutation = useMutation({
    mutationFn: async ({
      text,
      conversationId,
      attachments,
      local,
      resume,
      workdir,
      namory,
    }: SendVars) => {
      const {
        conversations,
        addMessage,
        appendMessageText,
        appendMessageTool,
        appendMessageThinking,
        setMessageText,
        setTyping,
        setTypingStatus,
        setAborter,
      } = useChatStore.getState();
      const conv = conversations.find((c) => c.id === conversationId);

      // 응답 말풍선은 첫 델타/도구 호출이 올 때 생성(그 전까진 typing 점 표시).
      const assistantId = makeId("a");
      let started = false;
      const ensureBubble = () => {
        if (started) return;
        started = true;
        setTyping(conversationId, false);
        addMessage(conversationId, {
          id: assistantId,
          role: "assistant",
          text: "",
          createdAt: new Date().toISOString(),
        });
      };

      // 델타를 한 글자씩 흘려 Claude 웹처럼 부드럽게 보이게 한다.
      const animator = new TextAnimator((chars) => {
        appendMessageText(conversationId, assistantId, chars);
      });

      // 로컬 모드: 데스크톱 로컬 에이전트(내 맥 파일/터미널)로 실행. 서버 navis 안 거침.
      if (local && localAgent) {
        const res = await localAgent.run(text, {
          resume,
          workdir,
          namory: namory ?? undefined,
          onDelta: (delta) => {
            ensureBubble();
            appendMessageText(conversationId, assistantId, delta);
          },
          // 도구 사용은 답변 본문과 분리해 접이식 '작업 과정' 블록(WorkDetails)에 쌓는다.
          onTool: (label) => {
            ensureBubble();
            appendMessageTool(conversationId, assistantId, label);
          },
          // 생각 과정도 별도 블록으로 누적.
          onThinking: (delta) => {
            ensureBubble();
            appendMessageThinking(conversationId, assistantId, delta);
          },
        });
        const replyText = res.error
          ? `⚠️ 로컬 에이전트: ${res.error}`
          : (res.text ?? "(빈 응답)");
        if (!started) {
          addMessage(conversationId, {
            id: assistantId,
            role: "assistant",
            text: replyText,
            createdAt: new Date().toISOString(),
          });
        } else {
          setMessageText(conversationId, assistantId, replyText);
        }
        // 코드 세션만 SDK 세션 id 를 저장해 다음 턴에 이어간다(멀티턴).
        // 일반 'chat' 의 localMode 는 서버 세션 네임스페이스와 섞이지 않게 저장 안 함.
        const isCode = conv?.kind === "code";
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
      // 중지 버튼용 AbortController — 방별로 스토어에 등록해 stopGenerating 이 끊는다.
      const controller = new AbortController();
      setAborter(conversationId, controller);

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
              animator.push(delta);
            },
            (tool) => {
              setTypingStatus(conversationId, tool);
            },
            (label) => {
              // 도구 완료 시점 — 말풍선이 없으면 먼저 만들고 도구 줄 추가
              ensureBubble();
              appendMessageTool(conversationId, assistantId, label);
            },
            // 사용자가 고른 모델(전역). 서버가 화이트리스트로 검증 후 적용.
            useChatStore.getState().model,
            controller.signal,
            (delta) => {
              // 생각 과정 — 본문 전에 올 수 있어 말풍선을 먼저 띄운다.
              ensureBubble();
              appendMessageThinking(conversationId, assistantId, delta);
            },
          );
          break;
        } catch (err) {
          // 사용자가 중지했으면 재시도하지 않고 부분 응답을 유지한 채 종료.
          if (controller.signal.aborted) {
            animator.flush();
            return {
              reply: { text: '', createdAt: new Date().toISOString() },
              sessionId: undefined,
              contextFull: false,
              saved: false,
              aborted: true,
            };
          }
          if (started || attempt >= MAX_ATTEMPTS) throw err;
          // 점증 백오프(0.7s → 1.4s)로 잠깐 쉬었다가 재시도.
          await new Promise((r) => setTimeout(r, attempt * 700));
        }
      }

      // 애니메이터 큐에 남은 글자 즉시 방출 후 권위 텍스트로 최종 보정.
      animator.flush();

      // 중지됨: 스트림이 정상 종료가 아니라 끊긴 것 → 지금까지 받은 부분 응답을
      // 그대로 두고 빈 권위 텍스트로 덮어쓰지 않는다.
      if (result.aborted) return result;

      const tools = result.toolsUsed ?? [];
      // 델타가 한 번도 안 왔으면 지금 생성, 왔으면 권위 텍스트로 보정.
      if (!started) {
        addMessage(conversationId, {
          id: assistantId,
          role: "assistant",
          text: result.reply.text,
          createdAt: result.reply.createdAt,
          toolsUsed: tools.length > 0 ? tools : undefined,
        });
      } else {
        setMessageText(conversationId, assistantId, result.reply.text);
        // 도구 목록은 텍스트와 별도로 붙인다
        if (tools.length > 0) {
          useChatStore
            .getState()
            .setMessageToolsUsed(conversationId, assistantId, tools);
        }
      }

      return result;
    },
    onMutate: ({ text, conversationId, attachments }) => {
      const { addMessage, setTyping } = useChatStore.getState();
      const userMessageId = makeId("u");
      addMessage(conversationId, {
        id: userMessageId,
        role: "user",
        text,
        createdAt: new Date().toISOString(),
        images: attachments?.map((a) => a.uri),
      });
      setTyping(conversationId, true);
      // onSuccess 에서 💡 부착에 쓸 유저 메시지 id 를 context 로 넘김
      return { userMessageId };
    },
    onSuccess: (
      { sessionId, contextFull, saved, reply, aborted },
      { conversationId },
      context,
    ) => {
      // 중지된 턴은 세션 id/저장/알림을 건드리지 않는다 — 기존 세션 맥락을 보존하고
      // 부분 응답만 남긴다.
      if (aborted) return;
      const { setSessionId, toggleReaction } = useChatStore.getState();
      setSessionId(
        conversationId,
        sessionId && !contextFull ? sessionId : undefined,
      );
      // 저장됐으면 유저 메시지에 💡
      if (saved && context?.userMessageId) {
        toggleReaction(conversationId, context.userMessageId, "💡");
      }
      // 포그라운드에서 같은 방을 보고 있지 않으면 네이티브 알림 (use-reports.ts 패턴과 동일).
      const watching =
        !isWindowHidden() &&
        useChatStore.getState().activeId === conversationId;
      if (!watching && reply?.text) {
        notify(
          "나비스",
          reply.text.replace(/\s+/g, " ").trim().slice(0, 140),
          () => {
            useUiStore.getState().setScreen("chat");
            useChatStore.getState().selectConversation(conversationId);
          },
        );
      }
    },
    onError: (_err, { conversationId }) => {
      useChatStore.getState().addMessage(conversationId, {
        id: makeId("a"),
        role: "assistant",
        text: "⚠️ 나비스 서버에 연결하지 못했어요 (자동 재시도 후에도 실패했어요). 잠시 후 다시 보내주세요.",
        createdAt: new Date().toISOString(),
      });
    },
    onSettled: (_data, _err, { conversationId }) => {
      const { setTyping, setAborter } = useChatStore.getState();
      setTyping(conversationId, false);
      setAborter(conversationId, undefined);
    },
  });

  // 현재 활성 대화방으로 전송. 코드 세션(kind==='code')만 데스크톱 로컬 에이전트로
  // 실행(내 맥 폴더 — 세션별 작업 폴더 + 세션 이어가기 + 프로젝트 기억 연결). 일반
  // 채팅은 항상 서버 navis 로 보낸다(별도 '로컬 모드' 토글 없음).
  const send = (text: string, attachments?: Attachment[]) => {
    const { activeId, conversations } = useChatStore.getState();
    const active = conversations.find((c) => c.id === activeId);
    const isCode = active?.kind === "code";
    const local = hasLocalAgent && isCode;
    const resume = isCode ? active?.sessionId : undefined;
    const workdir = isCode ? active?.workdir : undefined;
    const conversationId = activeId;
    if (isCode) {
      // 코드 세션: namory 좌표를 먼저 받아 기억을 물린 뒤 전송(실패해도 순정으로 진행).
      void fetchNamoryMcp().then((namory) =>
        mutation.mutate({
          text,
          conversationId,
          attachments,
          local,
          resume,
          workdir,
          namory,
        }),
      );
      return;
    }
    mutation.mutate({ text, conversationId, attachments, local, resume });
  };

  return { send };
}
