// @navis/domain — 비즈니스 로직. 유일하게 DB 와 Agent SDK 를 아는 계층.
//
// 의존 방향: validation ← db ← domain. 반대로 흐르면 안 된다 —
// domain 이 validation 을 import 하는 건 맞고, validation 이 domain 을
// import 하면 그 순간 RN 번들에서 못 쓰게 된다.
//
// 소비자는 apps/server 하나다. 웹·모바일은 HTTP 로 server 를 부른다(@navis/api).
// 그래서 DATABASE_URL 과 CLAUDE_CODE_OAUTH_TOKEN 을 아는 배포 단위가 하나로 유지된다.

export * as memory from "./memory/index";
export * as chat from "./chat/index";
export * as conversation from "./conversation/index";
export * as settings from "./settings/index";
