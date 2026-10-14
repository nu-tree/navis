// specs/003 T017 — 긴 방의 세션 교체 판정(R8). 순수 함수라 DB 가 필요 없다.
import { describe, expect, it } from "vitest";
import { SESSION_TURN_LIMIT, shouldStartFreshSession } from "../../src/conversation/index";

describe("shouldStartFreshSession()", () => {
  it("세션이 없으면 새로 연다 — 새 방, 또는 약속 메시지로 비운 방", () => {
    expect(shouldStartFreshSession({ sessionId: null, sessionTurns: 0 })).toBe(true);
  });

  it("한도 아래면 이어 쓴다", () => {
    expect(shouldStartFreshSession({ sessionId: "s", sessionTurns: SESSION_TURN_LIMIT - 1 })).toBe(false);
  });

  // 세션이 대화를 통째로 들고 다녀 첫 토큰이 늦어지는 것을 막는다.
  it("한도에 닿으면 새로 연다", () => {
    expect(SESSION_TURN_LIMIT).toBe(30);
    expect(shouldStartFreshSession({ sessionId: "s", sessionTurns: SESSION_TURN_LIMIT })).toBe(true);
  });
});
