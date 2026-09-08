import { hasHandoff } from "./chat-turns.js";

// 스냅샷 없는 요청(진단 curl·새로고침·레거시 클라)이 끊긴 뒤 이 시간이 지나면
// "버려진 요청"으로 보고 생성을 끊어 자원을 회수한다. 진짜 앱 턴(turnId+대화+스냅샷)은
// 백그라운드 완주 대상이라 이 유예의 적용을 받지 않는다(아래 backgroundable).
const ABANDON_GRACE_MS = 15_000;

// 한 챗 턴의 wall-clock 상한. 백그라운드 완주 턴은 연결 종료로 끊지 않으므로, 어떤
// 이유로든(모델 API 스톨 등) result 가 영영 안 오는 생성이 매달려 있지 않게 두는 안전
// backstop. 정상 답변은 도구 루프를 포함해도 여기 닿지 않게 넉넉히 잡는다(5분).
//
// 주의: 이 값은 배포 플랫폼의 함수 실행시간 상한보다 짧아야 의미가 있다. Vercel Hobby
// 는 300초 고정이라 5분과 사실상 같다 — 플랫폼이 먼저 죽이면 이 타이머는 못 돈다.
const MAX_TURN_MS = 5 * 60_000;

// 스트림 가드 상태 — 클라 연결 종료가 mutate 하는 clientGone 을 본문으로 노출.
export type StreamState = { clientGone: boolean };

// 가드 판단에 필요한 최소 파라미터(backgroundable 판정 + 핸드오프 키).
export type AbandonGuardParams = {
  turnId: string | undefined;
  conversationId: string | undefined;
  hasSnapshot: boolean;
};

// 연결 종료 / wall-clock 상한 / 핸드오프 유예를 묶어서 켠다.
//
// 연결 종료 감지는 Node 의 req.on("close") 대신 Web 표준 req.signal 의 abort 를 쓴다
// (Next.js Route Handler 가 클라 연결 종료 시 이 시그널을 끊어준다).
export function setupAbandonGuards(
  reqSignal: AbortSignal,
  params: AbandonGuardParams,
  ctrl: AbortController,
  onClientGone: () => void,
): { state: StreamState; cleanup: () => void } {
  const state: StreamState = { clientGone: false };
  const backgroundable = !!(params.turnId && params.conversationId && params.hasSnapshot);
  let abandonTimer: ReturnType<typeof setTimeout> | undefined;
  const maxTurnTimer = setTimeout(() => {
    if (!ctrl.signal.aborted) ctrl.abort();
  }, MAX_TURN_MS);

  const onAbort = (): void => {
    onClientGone();
    state.clientGone = true;
    // 백그라운드 완주 대상 턴은 끊지 않는다 — 완료 시 clientGone(또는 핸드오프)으로
    // 영속 + 푸시 분기를 탄다. 답을 잃지 않는 것이 최우선.
    if (backgroundable) return;
    // 스냅샷 없는 요청만 "버려진 요청"으로 보고 유예 후 회수.
    abandonTimer = setTimeout(() => {
      void (async () => {
        const handed = params.turnId ? await hasHandoff(params.turnId) : false;
        if (!handed && !ctrl.signal.aborted) ctrl.abort();
      })();
    }, ABANDON_GRACE_MS);
  };

  if (reqSignal.aborted) onAbort();
  else reqSignal.addEventListener("abort", onAbort, { once: true });

  return {
    state,
    cleanup: () => {
      if (abandonTimer) clearTimeout(abandonTimer);
      clearTimeout(maxTurnTimer);
      reqSignal.removeEventListener("abort", onAbort);
    },
  };
}
