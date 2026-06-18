// ── 워밍 세션: 설정·플래그·에러 타입 ─────────────────────────────────────────
// 워밍 세션의 동작 한계값(유휴/최대 세션/턴 타임아웃)과 활성 플래그, 그리고 워밍 경로가
// 콜드 폴백/용량 초과를 신호할 때 던지는 에러 타입을 한곳에 모은다.
//
// 워밍 세션이란: 매 메시지마다 CLI 프로세스를 새로 스폰하고 모든 MCP 서버를 핸드셰이크하던
// 비용(첫 토큰 ~1.6s 바닥, 모델 무관)을 없애기 위해, 대화별로 query() 세션을 streaming-input
// 모드로 "살려둔다". 2번째 메시지부터는 같은 프로세스·연결을 재사용해 스폰+핸드셰이크를
// 통째로 건너뛴다.
//
// 안전장치:
//  - 기본 비활성(NAVIS_WARM_SESSIONS=1 일 때만). 켜도 실패 시 콜드 askClaude 로 폴백.
//  - 단일 비행(한 대화는 동시에 한 턴만) — 겹치면 그 메시지는 콜드 폴백.
//  - 모델 변경/세션 리셋(resume 불일치)/컨텍스트 한도 초과 시 세션 폐기 후 재생성.
//  - 유휴 타임아웃·최대 세션 수 제한으로 메모리 관리.
//  - 이미지/확장사고(thinking) 턴은 워밍 대상에서 제외(호출부가 콜드로 보냄).

export const IDLE_MS = 10 * 60_000; // 10분 유휴 시 세션 폐기

// 동시 워밍 세션 상한(초과 시 LRU 폐기). 워밍 세션 하나당 Claude CLI 서브프로세스가
// 상주하므로, 작은 인스턴스(Railway hobby)에선 이 값이 크면 CPU/메모리가 고갈돼 이벤트
// 루프가 굶고 응답이 분 단위로 느려질 수 있다. NAVIS_WARM_MAX_SESSIONS 로 인스턴스
// 크기에 맞춰 조절(미설정 시 40). 단일 사용자/작은 플랜은 2~3 권장.
export const MAX_SESSIONS = (() => {
  const n = Number.parseInt(process.env.NAVIS_WARM_MAX_SESSIONS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
})();

// 한 턴 wall-clock 상한. streaming-input 가정(턴마다 result 1개)이 틀려 result 가 영영
// 안 와도 무한 행을 막는 안전 backstop — 정상 턴엔 안 닿게 넉넉히(도구 루프 포함).
export const TURN_TIMEOUT_MS = 5 * 60_000;

export function warmEnabled(): boolean {
  const v = process.env.NAVIS_WARM_SESSIONS;
  return v === "1" || v === "true";
}

// 워밍 경로가 "이 턴을 콜드로 돌려라"라고 신호하는 에러. 스트리밍을 시작하기 전에만
// 던진다(이미 델타를 흘린 뒤엔 폴백이 중복을 만들므로 일반 에러로 전파).
export class WarmFallback extends Error {
  constructor(reason: string) {
    super(`warm-fallback: ${reason}`);
    this.name = "WarmFallback";
  }
}

// LRU 폐기 후보가 없을 때(상한에 도달했고 모든 세션이 busy) createSession 이 던지는
// 신호. 호출부(runWarmTurn)가 받아서 WarmFallback 으로 변환해 콜드 askClaude 로 폴백한다.
// 예전에는 후보가 없으면 그냥 sessions.set 으로 진행해 MAX_SESSIONS 를 초과한 채
// Claude CLI 서브프로세스가 무제한 상주하던 버그가 있었음.
export class WarmCapacity extends Error {
  constructor() {
    super("warm-capacity: all sessions busy, cannot evict");
    this.name = "WarmCapacity";
  }
}
