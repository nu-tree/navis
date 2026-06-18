// ── 라우터 타입 정의 ────────────────────────────────────────────────────
// 라우트 테이블·매처·디스패처가 공유하는 핵심 타입. 순수 타입만 두어
// 매칭 유틸(matchers)·라우트 테이블(routes)·디스패처(dispatch)가 함께 참조한다.

import type { IncomingMessage, ServerResponse } from "node:http";

// 경로 매칭 결과. ok 가 true 면 매치, id 는 /:id 캡처값(없을 수 있음).
export type Match = { ok: true; id?: string } | { ok: false };

// pathname 한 건을 받아 매칭 여부를 판정하는 함수.
export type Matcher = (pathname: string) => Match;

// 실제 요청을 처리하는 핸들러. match 로 캡처된 id 를 함께 받는다.
export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  match: { id?: string },
) => void | Promise<void>;

// "*" 는 메서드 와일드카드(메모리스 핸들러는 내부에서 GET/PATCH/DELETE 라우팅).
export interface Route {
  method: string;
  match: Matcher;
  handler: Handler;
}
