// 요금제 한도 — rate_limit_info 해석은 순수 함수로, 저장(덮어쓰기)은 실제 Postgres 로 본다.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, usageLimits } from "@navis/db";
import { getLimits, limitsFrom, recordLimits } from "../../src/usage/index";
import { TEST_USERS, USER_A } from "../test-users";

// 2026-10-22 실측 — claude.ai 화면이 5시간 32% · 주간 21% 일 때 온 값.
const OBSERVED = {
  status: "allowed",
  resetsAt: 1792662600,
  rateLimitType: "five_hour",
  overageStatus: "rejected",
  overageDisabledReason: "org_level_disabled",
  isUsingOverage: false,
  unifiedWindows: {
    five_hour: { utilization: 0.31, resetsAt: 1792662600 },
    seven_day: { utilization: 0.21, resetsAt: 1793073600 },
  },
};

describe("limitsFrom", () => {
  it("unifiedWindows 의 두 창을 비율 그대로, 초기화 시각은 Date 로", () => {
    expect(limitsFrom(OBSERVED)).toEqual({
      fiveHour: { utilization: 0.31, resetsAt: new Date(1792662600 * 1000) },
      sevenDay: { utilization: 0.21, resetsAt: new Date(1793073600 * 1000) },
      status: "allowed",
    });
  });

  it("한 창만 오면 다른 창은 null", () => {
    const only = { status: "allowed_warning", unifiedWindows: { seven_day: { utilization: 0.9, resetsAt: 1793073600 } } };
    expect(limitsFrom(only)).toEqual({
      fiveHour: null,
      sevenDay: { utilization: 0.9, resetsAt: new Date(1793073600 * 1000) },
      status: "allowed_warning",
    });
  });

  it("창이 없으면 null — 요금제 한도가 없는 토큰", () => {
    expect(limitsFrom({ status: "allowed" })).toBeNull();
    expect(limitsFrom(undefined)).toBeNull();
    expect(limitsFrom({ unifiedWindows: { five_hour: { utilization: "0.3" } } })).toBeNull();
  });
});

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("recordLimits (실제 DB)", () => {
  const cleanup = () => db.delete(usageLimits).where(inArray(usageLimits.userId, [...TEST_USERS]));
  afterAll(cleanup);
  beforeEach(cleanup);

  const row = async () => (await db.select().from(usageLimits).where(eq(usageLimits.userId, USER_A)))[0];

  it("회원마다 한 행 — 다시 기록하면 마지막 값으로 덮는다", async () => {
    await recordLimits(USER_A, limitsFrom(OBSERVED)!, new Date("2026-10-22T08:00:00Z"));
    await recordLimits(
      USER_A,
      { fiveHour: { utilization: 0.5, resetsAt: new Date("2026-10-22T09:30:00Z") }, sevenDay: null, status: "allowed_warning" },
      new Date("2026-10-22T08:10:00Z"),
    );
    expect(await row()).toEqual({
      userId: USER_A,
      fiveHourUtilization: 0.5,
      fiveHourResetsAt: new Date("2026-10-22T09:30:00Z"),
      sevenDayUtilization: null,
      sevenDayResetsAt: null,
      status: "allowed_warning",
      observedAt: new Date("2026-10-22T08:10:00Z"),
    });
  });

  it("getLimits — 받은 적 없으면 null, 있으면 와이어 모양(ISO 문자열)", async () => {
    expect(await getLimits(USER_A)).toBeNull();
    await recordLimits(USER_A, limitsFrom(OBSERVED)!, new Date("2026-10-22T08:00:00Z"));
    expect(await getLimits(USER_A)).toEqual({
      fiveHour: { utilization: 0.31, resetsAt: "2026-10-22T09:50:00.000Z" },
      sevenDay: { utilization: 0.21, resetsAt: "2026-10-27T04:00:00.000Z" },
      status: "allowed",
      observedAt: "2026-10-22T08:00:00.000Z",
    });
  });
});
