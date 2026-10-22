// 도메인 오류 — 라우트가 HTTP status 로 번역하는 단위다.
//
// ★ 오류의 **종류**로 판정한다. 메시지 문자열로 분기하지 않는다.
//   예전 구현은 한국어 메시지(`msg.startsWith("해당 id의")`)로 status 를 정했다 —
//   문구를 다듬으면 404 가 500 이 된다(STRUCTURE.md 7항, FR-041).

/** 요청한 자원이 없다 → 404. */
export class NotFoundError extends Error {
  readonly kind = "not_found" as const;

  constructor(
    /** 무엇이 없었는지 (예: "memory", "conversation"). */
    readonly resource: string,
    readonly id: string,
  ) {
    super(`${resource} 를 찾을 수 없다: ${id}`);
    this.name = "NotFoundError";
  }
}

/** 임베딩 서비스가 실패했거나 쓸 수 없는 응답을 줬다 → 502. */
export class EmbeddingError extends Error {
  readonly kind = "embedding" as const;

  // cause 는 Error 가 이미 갖는 필드다. 파라미터 프로퍼티로 다시 선언하면
  // noImplicitOverride 가 잡는다 — super 의 options 로 넘긴다.
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "EmbeddingError";
  }
}

/** 같은 방에 진행 중인 턴이 있다 → 409. */
export class TurnInProgressError extends Error {
  readonly kind = "turn_in_progress" as const;

  constructor(readonly conversationId: string) {
    super(`이미 진행 중인 턴이 있다: ${conversationId}`);
    this.name = "TurnInProgressError";
  }
}

/** Claude 토큰이 등록되지 않았다 → 대화는 설정 화면으로 가라는 안내로 끝난다(FR-056). */
export class ClaudeTokenMissingError extends Error {
  readonly kind = "claude_token_missing" as const;

  constructor() {
    super("Claude 토큰이 등록되지 않았습니다. 설정 화면에서 등록해주세요.");
    this.name = "ClaudeTokenMissingError";
  }
}

/** Claude 가 토큰을 거부했다(만료 · 잘못된 값) → 설정 화면에서 교체하라는 안내(FR-056). */
export class ClaudeTokenRejectedError extends Error {
  readonly kind = "claude_token_rejected" as const;

  constructor(readonly reason: string) {
    super("Claude 가 토큰을 거부했습니다. 만료됐거나 잘못된 값입니다 — 설정 화면에서 교체해주세요.");
    this.name = "ClaudeTokenRejectedError";
  }
}

/**
 * Claude 요금제 한도를 다 썼다 → 언제 다시 쓸 수 있는지 알린다. 토큰 문제가 아니라 기다리면 풀린다.
 * window · resetsAt 은 직전 rate_limit_event(status: rejected)에서 온다. 없으면 시각 없이 말한다.
 */
export class ClaudeRateLimitedError extends Error {
  readonly kind = "claude_rate_limited" as const;

  constructor(
    /** 걸린 한도 — five_hour · seven_day · seven_day_opus … */
    readonly window: string | null,
    readonly resetsAt: Date | null,
    /** 사람이 읽는 초기화 시각(한국 시간). 오류 모듈이 시간대를 몰라도 되게 밖에서 만들어 넘긴다. */
    resetsAtLabel: string | null,
  ) {
    const name = window ? (RATE_LIMIT_WINDOW_NAMES[window] ?? "사용 한도") : "사용 한도";
    super(
      resetsAtLabel
        ? `Claude ${name}를 다 썼어요. ${resetsAtLabel}부터 다시 쓸 수 있어요.`
        : `Claude ${name}를 다 썼어요. 잠시 뒤 다시 시도해 주세요.`,
    );
    this.name = "ClaudeRateLimitedError";
  }
}

const RATE_LIMIT_WINDOW_NAMES: Record<string, string> = {
  five_hour: "5시간 한도",
  seven_day: "주간 한도",
  seven_day_opus: "주간 Opus 한도",
  seven_day_sonnet: "주간 Sonnet 한도",
};

/** "나비스" 방은 지울 수 없다 → 409(specs/003 R9). */
export class MainRoomUndeletableError extends Error {
  readonly kind = "main_room_undeletable" as const;

  constructor() {
    super("나비스 방은 지울 수 없어요.");
    this.name = "MainRoomUndeletableError";
  }
}

/** 켜진 약속이 상한에 닿았다 → 422(FR-006). 문구는 모델 · 화면이 그대로 보여 준다. */
export class PromiseLimitError extends Error {
  readonly kind = "promise_limit" as const;

  constructor(readonly limit: number) {
    super(`켜진 약속이 이미 ${limit}개예요. 하나를 끄거나 지운 뒤에 만들 수 있어요.`);
    this.name = "PromiseLimitError";
  }
}

/** 약속 일정이 잘못됐다(과거 · 해석 불가 · 간격 1시간 미만) → 422. 이유가 곧 메시지다. */
export class ScheduleInvalidError extends Error {
  readonly kind = "schedule_invalid" as const;

  constructor(reason: string) {
    super(reason);
    this.name = "ScheduleInvalidError";
  }
}

export const isMainRoomUndeletable = (e: unknown): e is MainRoomUndeletableError =>
  e instanceof MainRoomUndeletableError;

export const isPromiseLimit = (e: unknown): e is PromiseLimitError => e instanceof PromiseLimitError;

export const isScheduleInvalid = (e: unknown): e is ScheduleInvalidError =>
  e instanceof ScheduleInvalidError;

export const isNotFound = (e: unknown): e is NotFoundError =>
  e instanceof NotFoundError;

export const isEmbeddingError = (e: unknown): e is EmbeddingError =>
  e instanceof EmbeddingError;

export const isTurnInProgress = (e: unknown): e is TurnInProgressError =>
  e instanceof TurnInProgressError;

export const isClaudeTokenError = (
  e: unknown,
): e is ClaudeTokenMissingError | ClaudeTokenRejectedError =>
  e instanceof ClaudeTokenMissingError || e instanceof ClaudeTokenRejectedError;

export const isClaudeRateLimited = (e: unknown): e is ClaudeRateLimitedError =>
  e instanceof ClaudeRateLimitedError;
