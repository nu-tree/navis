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

export const isNotFound = (e: unknown): e is NotFoundError =>
  e instanceof NotFoundError;

export const isEmbeddingError = (e: unknown): e is EmbeddingError =>
  e instanceof EmbeddingError;

export const isTurnInProgress = (e: unknown): e is TurnInProgressError =>
  e instanceof TurnInProgressError;
