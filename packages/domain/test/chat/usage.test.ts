// 답 아래 토큰 표시의 근거 — 결과 메시지의 모델별 사용량을 턴 하나로 더한다.
import { describe, expect, it } from "vitest";
import { usageFrom } from "../../src/chat/index";

const model = (input: number, output: number, cacheRead: number, cacheWrite: number) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadInputTokens: cacheRead,
  cacheCreationInputTokens: cacheWrite,
});

describe("usageFrom()", () => {
  it("모델이 여럿이면(보조 호출) 더한다", () => {
    expect(
      usageFrom({ "claude-opus-5": model(100, 50, 30000, 2000), "claude-haiku-4-5": model(10, 5, 0, 0) }),
    ).toEqual({ input: 110, output: 55, cacheRead: 30000, cacheWrite: 2000 });
  });

  it("호출이 없었으면 0", () => {
    expect(usageFrom({})).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });
});
