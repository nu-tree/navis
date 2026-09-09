// @navis/validation — 모든 경계에서 공유하는 zod 스키마 + 타입.
//
// ★ 이 패키지는 zod 외에 아무것도 import 하지 않는다.
//   drizzle·Agent SDK·Next·React 를 끌어오면 React Native 번들에서 못 쓰게 되고,
//   그러면 이 패키지가 분리된 이유 자체가 사라진다. 의존을 추가하기 전에 멈출 것.

export * from "./memory";
export * from "./chat";
export * from "./conversation";
