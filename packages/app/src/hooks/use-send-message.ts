import { useMutation } from "@tanstack/react-query";
import { sendMessageStream, type Attachment } from "../api/navis";
import { fetchNamoryMcp } from "../api/agent";
import { useChatStore } from "../store/chat-store";
import { useUiStore } from "../store/ui-store";
import { localAgent, hasLocalAgent } from "../lib/local-agent";
import { makeId } from "../lib/id";
import { notify, isWindowHidden } from "../lib/notify";
import { TextAnimator } from "../lib/text-animator";
import type { SendVars, StreamContext } from "./use-send-message/types";
import { runLocalAgent } from "./use-send-message/run-local-agent";
import { runServerStream } from "./use-send-message/run-server-stream";

// 메시지 전송 = TanStack Query mutation. 대화방(conversationId) 단위로 동작해
// 각 방이 독립 세션·typing 상태를 가진다. 응답은 토큰 스트리밍으로 받아 점진 표시한다.
export function useSendMessage() {
  const mutation = useMutation({
    mutationFn: async (vars: SendVars) => {
      const { text, conversationId, attachments, local } = vars;
      const { conversations, addMessage, appendMessageText, setTypingStatus } =
        useChatStore.getState();
      const conv = conversations.find((c) => c.id === conversationId);

      // 응답 말풍선은 첫 델타/도구 호출이 올 때 생성(그 전까진 typing 점 표시).
      const assistantId = makeId("a");
      let started = false;
      const ensureBubble = () => {
        if (started) return;
        started = true;
        // typing 은 여기서 끄지 않는다 — 답변이 스트리밍되는 동안에도 로딩
        // 인디케이터("기억을 다듬는 중…")를 말풍선 아래에 계속 띄워, 응답이 끝났는지
        // 아직 진행 중인지 명확히 보이게 한다. onSettled(완전 종료/중지/에러)에서만 끈다.
        addMessage(conversationId, {
          id: assistantId,
          role: "assistant",
          text: "",
          createdAt: new Date().toISOString(),
        });
        // 이 말풍선이 스트리밍 중임을 표시 — 작업/생각 블록 자동 펼침. onSettled 에서 해제.
        useChatStore.getState().setStreamingId(conversationId, assistantId);
      };

      // 델타를 한 글자씩 흘려 Claude 웹처럼 부드럽게 보이게 한다.
      const animator = new TextAnimator((chars) => {
        appendMessageText(conversationId, assistantId, chars);
      });

      // typing 인디케이터 상태 갱신 — 같은 값이면 set 을 건너뛴다(델타마다 호출되므로
      // 매번 스토어를 갈아끼우면 모든 구독자가 불필요하게 재렌더된다).
      // '__thinking__'/'__answering__' 은 typing-indicator 가 문구로 변환하는 의사 상태.
      const setStatus = (s: string) => {
        if (useChatStore.getState().typingStatus[conversationId] !== s)
          setTypingStatus(conversationId, s);
      };

      // 분리된 러너에 주입할 공유 스트림 컨텍스트(말풍선 생성/typing/시작 여부).
      const ctx: StreamContext = {
        conversationId,
        assistantId,
        ensureBubble,
        isStarted: () => started,
        setStatus,
      };

      // 로컬 모드: 데스크톱 로컬 에이전트(내 맥 파일/터미널)로 실행. 서버 navis 안 거침.
      if (local && localAgent) {
        return runLocalAgent(vars, ctx, conv?.kind === "code");
      }

      // 기본 경로: 서버 navis 스트림(재시도·중지·백그라운드 핸드오프 포함).
      return runServerStream(vars, ctx, conv, animator);
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
    onSuccess: (data, { conversationId }, context) => {
      const { sessionId, contextFull, saved, reply, aborted, incomplete } =
        data as Awaited<ReturnType<typeof sendMessageStream>>;
      // 중지된 턴은 세션 id/저장/알림을 건드리지 않는다 — 기존 세션 맥락을 보존하고
      // 부분 응답만 남긴다.
      if (aborted) return;
      // 백그라운드 핸드오프: 서버가 완주·영속·푸시한다. 세션 id/저장/알림은 동기화 pull
      // 로 서버 권위 행에서 내려오므로 여기서 건드리지 않는다(빈 sessionId 로 덮어쓰면
      // 멀티턴이 끊긴다).
      if (incomplete) return;
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
      const { setTyping, setAborter, setCanceler, setInflightTurn, setStreamingId } =
        useChatStore.getState();
      setTyping(conversationId, false);
      setAborter(conversationId, undefined);
      setCanceler(conversationId, undefined);
      // 턴 종료 → 백그라운드 핸드오프 대상에서 제거.
      setInflightTurn(conversationId, undefined);
      // 스트리밍 종료(완료/중지/에러) — 작업/생각 블록 자동 접힘.
      setStreamingId(conversationId, undefined);
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
