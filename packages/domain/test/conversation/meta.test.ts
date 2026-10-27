// 메시지 meta jsonb ↔ 와이어. 토큰 · 참고한 기억이 저장되고 방을 다시 열어도 돌아오는지.
import { describe, expect, it } from "vitest";
import { toMessage, toMeta } from "../../src/conversation/index";

const usage = { input: 680, output: 520, cacheRead: 38400, cacheWrite: 1200 };
const memoriesUsed = {
  total: 1,
  items: [{ id: "m1", content: "나비스는 한국어로 답한다", category: "decision" as const, project: "navis", createdAt: "2026-10-01T00:00:00.000Z" }],
};
const row = (meta: unknown) => ({ id: "x", role: "assistant", text: "답", meta, createdAt: new Date("2026-10-27T00:00:00Z") });

describe("toMeta() / toMessage() — usage · memoriesUsed", () => {
  it("저장한 값이 그대로 돌아온다", () => {
    const meta = toMeta({ usage, memoriesUsed });
    expect(toMessage(row(meta))).toMatchObject({ usage, memoriesUsed });
  });

  it("빈 참고 기억은 싣지 않는다 · 예전 메시지에는 둘 다 없다", () => {
    expect(toMeta({ memoriesUsed: { total: 0, items: [] } })).toEqual({});
    const m = toMessage(row({}));
    expect(m.usage).toBeUndefined();
    expect(m.memoriesUsed).toBeUndefined();
  });
});
