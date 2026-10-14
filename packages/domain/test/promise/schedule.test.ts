// specs/003 T021 · T033 — 약속 일정(R6). 순수 함수라 DB 가 필요 없다.
import { describe, expect, it } from "vitest";
import { ScheduleInvalidError } from "../../src/errors";
import {
  describeSchedule,
  formatKst,
  nextRunAfter,
  upcoming,
  validateSchedule,
} from "../../src/promise/schedule";

// 2026-10-14(수) 16:00 KST
const NOW = new Date("2026-10-14T07:00:00Z");

describe("한 번짜리 약속", () => {
  it("미래 시각은 그대로 다음 회차가 된다", () => {
    const s = validateSchedule({ at: "2026-10-15T15:00:00+09:00" }, NOW);
    expect(s).toEqual({ kind: "once", runAt: new Date("2026-10-15T06:00:00Z") });
    expect(nextRunAfter(s, NOW)).toEqual(new Date("2026-10-15T06:00:00Z"));
  });

  it("실행한 뒤에는 다음 회차가 없다", () => {
    const s = validateSchedule({ at: "2026-10-15T15:00:00+09:00" }, NOW);
    expect(nextRunAfter(s, new Date("2026-10-15T06:00:30Z"))).toBeNull();
  });

  it("지난 시각은 거절하고, 지금 시각을 함께 알려 준다", () => {
    expect(() => validateSchedule({ at: "2026-10-14T15:00:00+09:00" }, NOW)).toThrow(ScheduleInvalidError);
    expect(() => validateSchedule({ at: "2026-10-14T15:00:00+09:00" }, NOW)).toThrow(/지금은 10월 14일\(수\) 16:00/);
  });

  it("사람이 읽는 표기는 한국 시간이다", () => {
    expect(formatKst(new Date("2026-10-15T06:00:00Z"))).toBe("10월 15일(목) 15:00");
    expect(describeSchedule({ kind: "once", runAt: new Date("2026-10-15T06:00:00Z") })).toBe(
      "10월 15일(목) 15:00 한 번",
    );
  });
});

describe("반복 약속 (cron, 한국 시간)", () => {
  it("0 21 * * * 의 다음 회차는 한국 21:00(UTC 12:00)", () => {
    const s = validateSchedule({ cron: "0 21 * * *" }, NOW);
    expect(nextRunAfter(s, NOW)).toEqual(new Date("2026-10-14T12:00:00Z"));
    expect(describeSchedule(s)).toBe("매일 21:00");
  });

  it("놓친 회차가 여러 개여도 지금 이후 첫 회차 하나만", () => {
    const s = validateSchedule({ cron: "0 9 * * *" }, new Date("2026-10-10T00:00:00Z"));
    // 10/11·12·13·14 아침 9시를 놓쳤다 — 몰아서 돌리지 않는다(FR-016).
    expect(nextRunAfter(s, NOW)).toEqual(new Date("2026-10-15T00:00:00Z"));
  });

  it("간격 1시간 미만은 거절하고 가까운 일정을 제안한다", () => {
    expect(() => validateSchedule({ cron: "*/30 * * * *" }, NOW)).toThrow(/최소 1시간/);
    expect(() => validateSchedule({ cron: "* * * * *" }, NOW)).toThrow(/매시 \d+분/);
  });

  // 하루 중 일부만 짧은 간격인 식도 잡는다.
  it("하루에 두 번이라도 30분 간격이면 거절한다", () => {
    expect(() => validateSchedule({ cron: "0,30 9 * * *" }, NOW)).toThrow(ScheduleInvalidError);
  });

  it("매시 정각은 통과한다", () => {
    const s = validateSchedule({ cron: "0 * * * *" }, NOW);
    expect(describeSchedule(s)).toBe("매시 0분");
  });

  it("잘못된 식은 거절한다", () => {
    expect(() => validateSchedule({ cron: "매일 아침" }, NOW)).toThrow(/읽을 수 없어요/);
  });

  it("매주 · 평일 표기", () => {
    expect(describeSchedule({ kind: "cron", cron: "30 8 * * 1" })).toBe("매주 월요일 08:30");
    expect(describeSchedule({ kind: "cron", cron: "0 18 * * 1-5" })).toBe("평일 18:00");
    expect(describeSchedule({ kind: "cron", cron: "0 9 1 * *" })).toBe("반복(0 9 1 * *)");
  });

  it("upcoming 은 다음 n 회차를 준다", () => {
    const s = validateSchedule({ cron: "0 21 * * *" }, NOW);
    expect(upcoming(s, NOW, 3).map(formatKst)).toEqual([
      "10월 14일(수) 21:00",
      "10월 15일(목) 21:00",
      "10월 16일(금) 21:00",
    ]);
  });
});
