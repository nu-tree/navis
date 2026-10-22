// 사용량 — 회원의 Claude 요금제 한도(5시간 · 주간)를 마지막으로 본 값 그대로 남긴다.
//
// 값의 출처(2026-10-22 실측, SDK 0.3.263): 대화 턴 중에 오는 rate_limit_event 의
// rate_limit_info.unifiedWindows. 사용률은 0~1 비율이다(0.21 = claude.ai 화면의 21%),
// resetsAt 은 유닉스 초. 이 필드는 SDK 타입에 없어서 모양을 직접 확인한다.
//
// 계산하지 않는다 — Claude 서버가 계산한 값이라 claude.ai · Claude Code 에서 쓴 것까지 들어가 있다.
// 저장하는 이유는 하나: 이 값은 나비스로 대화할 때만 오므로, 설정 화면을 열 때 보여 줄 마지막 값이 필요하다.
//
// ★ 기록이 실패해도 턴은 실패하지 않는다 — 호출하는 쪽(chat)이 잡아서 로그만 남긴다.

import { eq } from "drizzle-orm";
import { db, usageLimits } from "@navis/db";
import type { PlanUsageStatus } from "@navis/validation";

export type PlanWindow = { utilization: number; resetsAt: Date };

export type PlanLimits = {
  fiveHour: PlanWindow | null;
  sevenDay: PlanWindow | null;
  /** allowed | allowed_warning | rejected */
  status: string;
};

const planWindow = (raw: unknown): PlanWindow | null => {
  const w = raw as { utilization?: unknown; resetsAt?: unknown } | null | undefined;
  if (typeof w?.utilization !== "number" || typeof w.resetsAt !== "number") return null;
  return { utilization: w.utilization, resetsAt: new Date(w.resetsAt * 1000) };
};

/** rate_limit_info → 한도. 두 창 모두 없으면 null(API 키 토큰처럼 요금제 한도가 없는 경우). */
export function limitsFrom(info: unknown): PlanLimits | null {
  const i = info as { status?: unknown; unifiedWindows?: Record<string, unknown> } | null | undefined;
  const fiveHour = planWindow(i?.unifiedWindows?.five_hour);
  const sevenDay = planWindow(i?.unifiedWindows?.seven_day);
  if (!fiveHour && !sevenDay) return null;
  return { fiveHour, sevenDay, status: typeof i?.status === "string" ? i.status : "allowed" };
}

/** 마지막으로 본 한도로 덮는다. userId 는 토큰 주인이다 — 한도는 토큰의 계정 것이다. */
export async function recordLimits(userId: string, limits: PlanLimits, at = new Date()): Promise<void> {
  const values = {
    fiveHourUtilization: limits.fiveHour?.utilization ?? null,
    fiveHourResetsAt: limits.fiveHour?.resetsAt ?? null,
    sevenDayUtilization: limits.sevenDay?.utilization ?? null,
    sevenDayResetsAt: limits.sevenDay?.resetsAt ?? null,
    status: limits.status,
    observedAt: at,
  };
  await db
    .insert(usageLimits)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: usageLimits.userId, set: values });
}

/** 화면용 — 마지막으로 받은 한도. 아직 받은 적이 없으면 null. */
export async function getLimits(userId: string): Promise<PlanUsageStatus> {
  const [row] = await db.select().from(usageLimits).where(eq(usageLimits.userId, userId));
  if (!row) return null;
  const win = (utilization: number | null, resetsAt: Date | null) =>
    utilization === null || resetsAt === null ? null : { utilization, resetsAt: resetsAt.toISOString() };
  return {
    fiveHour: win(row.fiveHourUtilization, row.fiveHourResetsAt),
    sevenDay: win(row.sevenDayUtilization, row.sevenDayResetsAt),
    status: row.status,
    observedAt: row.observedAt.toISOString(),
  };
}
