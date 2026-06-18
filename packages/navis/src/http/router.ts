// ── HTTP 라우터 (공개 진입점) ───────────────────────────────────────────
// 실제 구현은 책임별로 router/ 하위 모듈에 분리되어 있다:
//   - router/types.ts     : Matcher/Match/Handler/Route 타입
//   - router/matchers.ts  : exact/prefix/param 경로 매칭 유틸
//   - router/routes.ts    : 라우트 테이블(메서드+매처+핸들러)
//   - router/dispatch.ts  : route() 디스패처
// 외부(index.ts)는 여기서 `route` 만 import 하므로 공개 API 를 그대로 재export 한다.

export { route } from "./router/dispatch.js";
