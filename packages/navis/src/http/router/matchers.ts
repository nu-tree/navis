// ── 경로 매칭 유틸 ──────────────────────────────────────────────────────
// 라우트 테이블에서 쓰는 매처 팩토리들. 모든 매칭은 URL.pathname 기준이라
// 쿼리스트링(`/api/chat?x=1`)이 붙어도 깨지지 않는다.

import type { Matcher } from "./types.js";

// 정확 일치 — pathname 이 path 와 같을 때만 매치.
export const exact =
  (path: string): Matcher =>
  (pathname) =>
    pathname === path ? { ok: true } : { ok: false };

// startsWith — 옛 `req.url?.startsWith(...)` 블록을 그대로 보존하기 위함.
export const prefix =
  (p: string): Matcher =>
  (pathname) =>
    pathname.startsWith(p) ? { ok: true } : { ok: false };

// /api/foo/:id 형태 — prefix 로 시작하고 그 뒤에 비어있지 않은 꼬리가 있을 때 매치.
// id 는 decodeURIComponent 로 복원해 핸들러로 넘긴다. 슬래시 포함 여부는 검사하지
// 않는다(기존 동작 보존: 잘못된 형식은 핸들러의 검증 단계에서 4xx 로 거른다).
export const param =
  (p: string): Matcher =>
  (pathname) => {
    if (!pathname.startsWith(p)) return { ok: false };
    const id = decodeURIComponent(pathname.slice(p.length));
    if (!id) return { ok: false };
    return { ok: true, id };
  };
