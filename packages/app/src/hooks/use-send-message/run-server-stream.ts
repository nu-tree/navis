// 서버 스트림 실행 경로 — 서버 navis 로 보내 토큰을 스트리밍 수신한다.
// 재시도(콜드스타트/네트워크 블립)·중지(abort)·백그라운드 핸드오프·권위 텍스트
// 보정까지 메시지 전송의 기본 경로를 담당한다.
import { sendMessageStream, cancelChat } from "../../api/navis";
import { useChatStore } from "../../store/chat-store";
import { makeId } from "../../lib/id";
import type { TextAnimator } from "../../lib/text-animator";
import type { SendVars, StreamContext } from "./types";

// 스토어의 대화방 한 건(스냅샷·sessionId 참조용). 메인 훅에서 찾아 넘긴다.
type Conversation = ReturnType<typeof useChatStore.getState>["conversations"][number];

// 정상 종료/핸드오프는 서버 결과(SendResult), 중지(abort)는 부분 응답만 담은
// 가벼운 형태로 돌려준다 — 원본 mutationFn 의 추론 반환 타입과 동일하게 유지.
type AbortResult = {
  reply: { text: string; createdAt: string };
  sessionId: undefined;
  contextFull: boolean;
  saved: boolean;
  aborted: boolean;
};
type ServerStreamResult = Awaited<ReturnType<typeof sendMessageStream>> | AbortResult;

const MAX_ATTEMPTS = 3;

// 서버 스트림 실행. 부분 응답을 점진 표시하고 종료 시 권위 텍스트로 보정한다.
export async function runServerStream(
  vars: SendVars,
  ctx: StreamContext,
  conv: Conversation | undefined,
  animator: TextAnimator,
): Promise<ServerStreamResult> {
  const { text, conversationId, attachments } = vars;
  const { assistantId, ensureBubble, isStarted, setStatus } = ctx;
  const {
    addMessage,
    appendMessageTool,
    appendMessageThinking,
    setMessageText,
    setAborter,
  } = useChatStore.getState();

  // 일시적 연결 실패(Railway 콜드스타트·네트워크 블립)는 사용자에게 에러를
  // 띄우기 전에 조용히 몇 번 재시도한다. 단, 델타가 한 번이라도 도착한 뒤(스트림
  // 시작됨)의 실패는 재시도하면 본문이 중복되므로 그대로 올려보낸다.
  // 중지 버튼용 AbortController — 방별로 스토어에 등록해 stopGenerating 이 끊는다.
  const controller = new AbortController();
  setAborter(conversationId, controller);

  // 백그라운드 완주/푸시 — 폰을 잠그거나 앱을 나가도(연결 끊김) 서버가 답을 끝까지
  // 만들어 대화에 써넣고 폰으로 푸시한다. 스냅샷(직전까지 메시지 = 방금 추가된 유저
  // 메시지 포함)을 보내 서버가 어시스턴트 메시지를 append 한다. turnId 로 서버 중지 매칭.
  const turnId = makeId("t");
  const snapshot = {
    title: conv?.title ?? "나비스와의 대화",
    messages: conv?.messages ?? [],
    unread: conv?.unread ?? 0,
    sessionId: conv?.sessionId ?? null,
  };
  // 중지 버튼이 서버에도 취소를 보내도록 등록 — 연결 종료만으론 서버가 안 멈춘다.
  useChatStore.getState().setCanceler(conversationId, () => void cancelChat(turnId));
  // 백그라운드 핸드오프용 — 앱이 백그라운드로 가면 이 turnId 로 서버에 완주를 알린다.
  useChatStore.getState().setInflightTurn(conversationId, turnId);

  let result: ServerStreamResult | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      result = await sendMessageStream(
        text,
        conv?.sessionId,
        attachments,
        (delta) => {
          ensureBubble();
          setStatus("__answering__");
          animator.push(delta);
        },
        (tool) => {
          setStatus(tool);
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
          setStatus("__thinking__");
          appendMessageThinking(conversationId, assistantId, delta);
        },
        // 백그라운드 완주/푸시 메타 — 클라가 응답 전에 떠나면 서버가 이걸로 영속+푸시.
        { conversationId, turnId, snapshot },
      );
      break;
    } catch (err) {
      // 사용자가 중지했으면 재시도하지 않고 부분 응답을 유지한 채 종료.
      if (controller.signal.aborted) {
        animator.flush();
        return {
          reply: { text: "", createdAt: new Date().toISOString() },
          sessionId: undefined,
          contextFull: false,
          saved: false,
          aborted: true,
        };
      }
      if (isStarted() || attempt >= MAX_ATTEMPTS) throw err;
      // 점증 백오프(0.7s → 1.4s)로 잠깐 쉬었다가 재시도.
      await new Promise((r) => setTimeout(r, attempt * 700));
    }
  }

  // 애니메이터 큐에 남은 글자 즉시 방출 후 권위 텍스트로 최종 보정.
  animator.flush();

  // 중지됨: 스트림이 정상 종료가 아니라 끊긴 것 → 지금까지 받은 부분 응답을
  // 그대로 두고 빈 권위 텍스트로 덮어쓰지 않는다.
  if (result.aborted) return result;

  // 백그라운드 핸드오프: 폰을 잠갔다/나가서 스트림이 done 없이 끊겼지만 서버가
  // 완주 중 → 에러 말풍선/덮어쓰기 없이 그대로 종료한다. 부분 말풍선은 다음 동기화
  // pull 에서 서버 권위 응답으로 교체되고, 서버가 폰으로 푸시도 보낸다. (에러로
  // 처리하면 updatedAt 이 갱신돼 LWW 에서 서버 응답을 덮어쓸 수 있어 위험.)
  if (result.incomplete) return result;

  const tools = result.toolsUsed ?? [];
  // 델타가 한 번도 안 왔으면 지금 생성, 왔으면 권위 텍스트로 보정.
  if (!isStarted()) {
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
}
