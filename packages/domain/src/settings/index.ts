// 설정 — 시스템 프롬프트(봇 성격) 조회/저장.
//
// 이관 예정: packages/navis/src/{system-prompt.ts,settings-kv.ts}
// 우선순위는 DB → env(SYSTEM_PROMPT) → 내장 기본값.
//
// 이관 시 주의: settings-kv 는 namory 를 HTTP 로 불렀다. 이제 @navis/db 직접.
// getSetting 의 빈 값 규약을 한쪽으로 통일할 것(예전엔 null 과 undefined 가 공존).

export {};
