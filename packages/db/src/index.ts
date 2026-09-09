// @navis/db — 저장 계층. drizzle 스키마 + 지연 연결 클라이언트.
//
// 이 패키지는 쿼리를 담지 않는다. 비즈니스 쿼리는 @navis/domain 이 갖는다 —
// 그래야 "무엇을 저장하는가"(여기)와 "어떻게 쓰는가"(domain)가 갈라진다.

export { db } from "./client";
export * as schema from "./schema";
export { memories, conversations, settings } from "./schema";
