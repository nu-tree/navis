import type { IncomingMessage } from "node:http";
import { hasHandoff } from "./chat-turns.js";

// 스냅샷 없는 요청(진단 curl·새로고침·레거시 클라)이 끊긴 뒤(clientGone) 이 시간이
// 지나면 "버려진 요청"으로 보고 생성을 끊어 자원을 회수한다. 진짜 앱 턴(turnId+대화+
// 스냅샷)은 백그라운드 완주 대상이라 이 유예의 적용을 받지 않는다(아래 backgroundable).
// 이 가드가 없으면 버려진 생성들이 단일 이벤트 루프를 점유해 새 요청의 첫 토큰을
// 수십 초 지연시킨다(누적→포화).
const ABANDON_GRACE_MS = 15_000;

// 한 챗 턴의 wall-clock 상한. 백그라운드 완주 턴은 연결 종료로 끊지 않으므로(위), 어떤
// 이유로든(모델 API 스톨 등) result 가 영영 안 오는 생성이 inflight 슬롯을 무한히
// 점유하지 않도록 모든 챗 스트림 턴에 두는 안전 backstop. 정상 답변은 도구 루프를
// 포함해도 여기 닿지 않게 넉넉히 잡는다(워밍 경로의 TURN_TIMEOUT_MS 와 동일 5분).
const MAX_TURN_MS = 5 * 60_000;

// 스트림 가드 상태 — req 'close' 콜백이 mutate 하는 clientGone 을 본문으로 노출.
export type StreamState = { clientGone: boolean };

// setupAbandonGuards 가 받는 최소 파라미터 — chat.ts 의 ChatRequest 전체를 끌어들이지
// 않고 가드 판단에 필요한 필드만 본다(backgroundable 판정 + 핸드오프 키).
export type AbandonGuardParams = {
  turnId: string | undefined;
  conversationId: string | undefined;
  hasSnapshot: boolean;
};

// 연결 종료 / wall-clock 상한 / 핸드오프 유예를 묶어서 켠다. 진짜 앱 턴(턴ID+대화+
// 스냅샷)은 backgroundable 로 보고 연결 끊겨도 생성을 끊지 않는다. cleanup 으로 타이머
// 정리(finally 1회). 본문 분기 가독성을 위한 추출이라 동작은 변경하지 않는다.
export function setupAbandonGuards(
  req: IncomingMessage,
  params: AbandonGuardParams,
  ctrl: AbortController,
  stopHeartbeat: () => void,
): { state: StreamState; cleanup: () => void } {
  const state: StreamState = { clientGone: false };
  const backgroundable = !!(params.turnId && params.conversationId && params.hasSnapshot);
  let abandonTimer: ReturnType<typeof setTimeout> | undefined;
  // wall-clock 안전 backstop — 백그라운드 완주 턴은 연결 종료로 끊지 않으니, 생성이
  // 영영 안 끝나는 병적 케이스(모델 API 스톨 등)가 슬롯을 무한 점유하지 않게 상한을 둔다.
  const maxTurnTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
    if (!ctrl.signal.aborted) ctrl.abort();
  }, MAX_TURN_MS);
  req.on("close", () => {
    stopHeartbeat();
    state.clientGone = true;
    // 백그라운드 완주 대상 턴은 끊지 않는다 — 완료 시 clientGone(또는 핸드오프)으로
    // 영속 + 푸시 분기를 탄다. 답을 잃지 않는 것이 최우선.
    if (backgroundable) return;
    // 스냅샷 없는 요청(진단 curl·새로고침·레거시 클라)만 "버려진 요청"으로 보고 유예
    // 후 회수 — 누적→포화(death-spiral) 방지 가드는 그대로.
    abandonTimer = setTimeout(() => {
      if (!(params.turnId && hasHandoff(params.turnId))) ctrl.abort();
    }, ABANDON_GRACE_MS);
  });
  return {
    state,
    cleanup: () => {
      if (abandonTimer) clearTimeout(abandonTimer);
      clearTimeout(maxTurnTimer);
    },
  };
}
