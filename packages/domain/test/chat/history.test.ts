import { describe, expect, it } from "vitest";
import { withHistory } from "../../src/chat/history";

const msg = (role: "user" | "assistant", text: string) => ({ role, text });

describe("withHistory", () => {
  it("기록이 없으면 프롬프트를 그대로 둔다", () => {
    expect(withHistory("안녕", [])).toBe("안녕");
  });

  it("이전 대화를 순서대로 앞에 붙이고 이번 메시지를 마지막에 둔다", () => {
    const out = withHistory("그래서 어디로 했지?", [
      msg("user", "배포 어디로 할까"),
      msg("assistant", "Cloud Run 을 추천해요"),
    ]);
    expect(out.indexOf("사용자: 배포 어디로 할까")).toBeLessThan(
      out.indexOf("나비스: Cloud Run 을 추천해요"),
    );
    expect(out.endsWith("[이번 메시지]\n그래서 어디로 했지?")).toBe(true);
  });

  it("빈 메시지(이미지만 보낸 턴)는 넣지 않는다", () => {
    const out = withHistory("q", [msg("user", "  "), msg("assistant", "a")]);
    expect(out).not.toContain("사용자:");
  });

  it("최근 20개만 쓴다", () => {
    const many = Array.from({ length: 30 }, (_, i) => msg("user", `m${i}`));
    const out = withHistory("q", many);
    expect(out).not.toContain("사용자: m9\n");
    expect(out).toContain("사용자: m10");
    expect(out).toContain("사용자: m29");
  });

  it("글자 한도를 넘으면 그보다 오래된 줄은 짧아도 버린다 — 중간이 빠지지 않는다", () => {
    const out = withHistory("q", [
      msg("user", "오래된 짧은 줄"),
      msg("assistant", "x".repeat(7_000)),
      msg("user", "y".repeat(2_000)),
      msg("assistant", "최근 답"),
    ]);
    expect(out).toContain("최근 답");
    expect(out).toContain("y".repeat(2_000));
    expect(out).not.toContain("x".repeat(7_000));
    expect(out).not.toContain("오래된 짧은 줄");
  });
});
