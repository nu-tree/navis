// 기간 경계 — KST 하루로 읽히는지, until 이 그날 끝까지 포함하는지가 계약이다.
import { describe, expect, it } from "vitest";
import { kstDate, parseSince, parseUntil } from "../../src/memory/range";

// 2026-10-08 01:30 KST = 2026-10-07 16:30 UTC. UTC 로 읽으면 "오늘"이 하루 밀리는 시각이다.
const now = new Date("2026-10-07T16:30:00Z");

describe("range", () => {
  it("KST 날짜를 쓴다 — UTC 날짜가 아니다", () => {
    expect(kstDate(now)).toBe("2026-10-08");
  });

  it("날짜 since 는 그날 KST 0시", () => {
    expect(parseSince("2026-10-07").toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });

  it("날짜 until 은 다음 날 KST 0시 미만 — 그날 끝까지 포함", () => {
    expect(parseUntil("2026-10-07").toISOString()).toBe("2026-10-07T15:00:00.000Z");
  });

  it("today · yesterday 를 KST 기준으로 푼다", () => {
    expect(parseSince("today", now).toISOString()).toBe("2026-10-07T15:00:00.000Z");
    expect(parseUntil("today", now).toISOString()).toBe("2026-10-08T15:00:00.000Z");
    expect(parseSince("yesterday", now).toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });

  it("오프셋 없는 시각은 KST, 있으면 그대로", () => {
    expect(parseSince("2026-10-07T09:00").toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(parseSince("2026-10-07T09:00:00Z").toISOString()).toBe("2026-10-07T09:00:00.000Z");
  });

  it("월말을 넘긴다", () => {
    expect(parseUntil("2026-10-31").toISOString()).toBe("2026-10-31T15:00:00.000Z");
  });
});
