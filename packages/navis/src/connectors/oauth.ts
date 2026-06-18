// OAuth 2.0 흐름 공개 진입점 barrel — 구현은 책임별로 ./oauth/* 하위 모듈에 있다.
// 외부 코드는 계속 이 파일(../connectors/oauth.js)을 import 한다 — 공개 export 동일.
//
// 모듈 구성:
//   - oauth/types.ts     : 공유 타입 + b64url + callbackPath
//   - oauth/discovery.ts : 메타데이터 발견 + Dynamic Client Registration
//   - oauth/token.ts     : 토큰 엔드포인트 호출/오류 분류/code 검증
//   - oauth/pending.ts   : 동의 진행중 pending 상태 + TTL 청소
//   - oauth/flow.ts      : startOAuth / completeOAuth / refreshIfNeeded 오케스트레이션

export { callbackPath } from "./oauth/types.js";
export { startOAuth, completeOAuth, refreshIfNeeded } from "./oauth/flow.js";
