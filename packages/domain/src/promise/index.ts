// 약속 — 만들기 · 보기 · 고치기 · 끄기 · 지우기, 그리고 실행의 선점 · 완료(specs/003).
//
// 모든 조회 · 수정은 회원으로 좁힌다. 남의 약속은 "없음"이다(specs/002 FR-103).
// 실행 자체(에이전트 턴)는 ./run.ts, 도구는 ./mcp.ts 에 있다.

import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { db, promiseRuns, promises } from "@navis/db";
import {
  PROMISE_ACTIVE_LIMIT,
  type PromiseCreateInput,
  type PromiseItem,
  type PromiseRunStatus,
  type PromiseRunSummary,
  type PromiseUpdateInput,
} from "@navis/validation";
import { NotFoundError, PromiseLimitError, ScheduleInvalidError } from "../errors";
import { describeSchedule, nextRunAfter, upcoming, validateSchedule, type Schedule } from "./schedule";

export { describeSchedule, formatKst, upcoming, type Schedule } from "./schedule";

type Row = typeof promises.$inferSelect;

/** 실행 임대(R3). 이 시간 안에 끝나지 않은 실행은 서버가 멈춘 것으로 보고 다시 집는다. */
export const LEASE_MS = 15 * 60 * 1000;
/** 반복 약속이 이만큼 연속 실패하면 끈다(R11). */
export const MAX_CONSECUTIVE_FAILURES = 3;
/** 약속마다 남기는 실행 기록 수. */
const RUNS_KEPT = 20;
/** 화면에 보이는 최근 실행 수. */
const RECENT_RUNS_SHOWN = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const scheduleOf = (row: Pick<Row, "scheduleKind" | "runAt" | "cron">): Schedule =>
  row.scheduleKind === "once" && row.runAt
    ? { kind: "once", runAt: row.runAt }
    : { kind: "cron", cron: row.cron ?? "" };

const toItem = (row: Row, runs: PromiseRunSummary[]): PromiseItem => {
  const schedule = scheduleOf(row);
  return {
    id: row.id,
    label: row.label,
    instruction: row.instruction,
    schedule:
      schedule.kind === "once"
        ? { kind: "once", at: schedule.runAt.toISOString() }
        : { kind: "cron", cron: schedule.cron, description: describeSchedule(schedule) },
    enabled: row.enabled,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    consecutiveFailures: row.consecutiveFailures,
    recentRuns: runs,
  };
};

const owned = (userId: string, id: string) => and(eq(promises.id, id), eq(promises.userId, userId));

async function getRow(userId: string, id: string): Promise<Row> {
  if (!UUID.test(id)) throw new NotFoundError("promise", id);
  const [row] = await db.select().from(promises).where(owned(userId, id)).limit(1);
  if (!row) throw new NotFoundError("promise", id);
  return row;
}

/** 켜진 약속 수. `except` 는 다시 켜려는 그 약속 — 자기 자신은 세지 않는다. */
async function activeCount(userId: string, except?: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(promises)
    .where(
      and(
        eq(promises.userId, userId),
        eq(promises.enabled, true),
        ...(except ? [ne(promises.id, except)] : []),
      ),
    );
  return row?.n ?? 0;
}

async function recentRunsOf(ids: string[]): Promise<Map<string, PromiseRunSummary[]>> {
  const byPromise = new Map<string, PromiseRunSummary[]>();
  if (!ids.length) return byPromise;
  const rows = await db
    .select({
      promiseId: promiseRuns.promiseId,
      startedAt: promiseRuns.startedAt,
      status: promiseRuns.status,
      error: promiseRuns.error,
    })
    .from(promiseRuns)
    .where(inArray(promiseRuns.promiseId, ids))
    .orderBy(desc(promiseRuns.startedAt));
  for (const r of rows) {
    const list = byPromise.get(r.promiseId) ?? [];
    if (list.length < RECENT_RUNS_SHOWN) {
      list.push({
        startedAt: r.startedAt.toISOString(),
        status: r.status as PromiseRunStatus,
        error: r.error,
      });
    }
    byPromise.set(r.promiseId, list);
  }
  return byPromise;
}

/** 만들거나 고친 뒤 도구가 돌려줄 것 — 저장된 약속과 다음 회차들. */
export type PromiseWithUpcoming = { promise: PromiseItem; upcoming: Date[] };

/**
 * 약속을 만든다. 켜진 약속 상한(FR-006)과 일정(R6)을 검사한다.
 * `originConversationId` 는 만든 대화방 — 방이 지워져도 약속은 남는다.
 */
export async function create(
  userId: string,
  input: PromiseCreateInput,
  originConversationId: string | null,
  now: Date = new Date(),
): Promise<PromiseWithUpcoming> {
  const schedule = validateSchedule(input.schedule, now);
  if ((await activeCount(userId)) >= PROMISE_ACTIVE_LIMIT) {
    throw new PromiseLimitError(PROMISE_ACTIVE_LIMIT);
  }

  const [row] = await db
    .insert(promises)
    .values({
      id: randomUUID(),
      userId,
      instruction: input.instruction,
      label: input.label,
      scheduleKind: schedule.kind,
      runAt: schedule.kind === "once" ? schedule.runAt : null,
      cron: schedule.kind === "cron" ? schedule.cron : null,
      nextRunAt: nextRunAfter(schedule, now),
      originConversationId,
    })
    .returning();
  if (!row) throw new Error("약속을 만들지 못했다.");
  return { promise: toItem(row, []), upcoming: upcoming(schedule, now, 3) };
}

/** 회원의 약속. 다음 실행 순(꺼진 · 끝난 것은 뒤). 끝난 약속은 includeEnded 일 때만. */
export async function list(
  userId: string,
  { includeEnded = false }: { includeEnded?: boolean } = {},
): Promise<PromiseItem[]> {
  const rows = await db
    .select()
    .from(promises)
    .where(and(eq(promises.userId, userId), ...(includeEnded ? [] : [isNull(promises.endedAt)])))
    .orderBy(sql`${promises.nextRunAt} asc nulls last`, desc(promises.createdAt));
  const runs = await recentRunsOf(rows.map((r) => r.id));
  return rows.map((r) => toItem(r, runs.get(r.id) ?? []));
}

export async function get(userId: string, id: string): Promise<PromiseItem> {
  const row = await getRow(userId, id);
  const runs = await recentRunsOf([row.id]);
  return toItem(row, runs.get(row.id) ?? []);
}

/**
 * 약속을 고친다. 준 필드만 바뀐다.
 *
 * - 일정을 바꾸면 다시 검증하고, 끝난 약속이면 다시 연다.
 * - 다시 켜면 상한을 세고, 다음 회차는 **지금 이후 첫 회차**다 — 꺼져 있던 동안 놓친 회차를
 *   몰아서 돌리지 않는다(FR-016).
 */
export async function update(
  userId: string,
  input: PromiseUpdateInput,
  now: Date = new Date(),
): Promise<PromiseWithUpcoming> {
  const row = await getRow(userId, input.id);
  const schedule = input.schedule ? validateSchedule(input.schedule, now) : scheduleOf(row);
  const enabled = input.enabled ?? (input.schedule ? true : row.enabled);

  if (enabled && !row.enabled && (await activeCount(userId, row.id)) >= PROMISE_ACTIVE_LIMIT) {
    throw new PromiseLimitError(PROMISE_ACTIVE_LIMIT);
  }

  const next = enabled ? nextRunAfter(schedule, now) : null;
  if (enabled && !next) {
    throw new ScheduleInvalidError("이미 지난 한 번짜리 약속이에요. 새 시각으로 고쳐 주세요.");
  }

  const [updated] = await db
    .update(promises)
    .set({
      ...(input.instruction ? { instruction: input.instruction } : {}),
      ...(input.label ? { label: input.label } : {}),
      scheduleKind: schedule.kind,
      runAt: schedule.kind === "once" ? schedule.runAt : null,
      cron: schedule.kind === "cron" ? schedule.cron : null,
      enabled,
      nextRunAt: next,
      // 다시 켜거나 일정을 바꾸면 끝남이 풀린다. 끄기만 하면 끝남 표시를 건드리지 않는다.
      ...(enabled ? { endedAt: null, consecutiveFailures: 0 } : {}),
      updatedAt: now,
    })
    .where(owned(userId, row.id))
    .returning();
  if (!updated) throw new NotFoundError("promise", input.id);
  const runs = await recentRunsOf([updated.id]);
  return { promise: toItem(updated, runs.get(updated.id) ?? []), upcoming: upcoming(schedule, now, 3) };
}

/** 화면의 켜고 끄기. */
export const setEnabled = (userId: string, id: string, enabled: boolean, now?: Date) =>
  update(userId, { id, enabled }, now);

/** 지운다. 실행 기록도 함께(외래 키 cascade). */
export async function remove(userId: string, id: string): Promise<void> {
  if (!UUID.test(id)) throw new NotFoundError("promise", id);
  const [row] = await db.delete(promises).where(owned(userId, id)).returning({ id: promises.id });
  if (!row) throw new NotFoundError("promise", id);
}

// ── 실행: 선점 · 완료 (tick 이 부른다) ─────────────────────────────────────

/** 선점한 한 회차. 실행이 끝나면 complete() 에 그대로 넘긴다. */
export type ClaimedRun = {
  runId: string;
  scheduledFor: Date;
  startedAt: Date;
  promise: Row;
};

/**
 * 기한이 된 약속을 선점한다(R3). 한 트랜잭션에서 행을 잠가 고르고(SKIP LOCKED — 동시에 도는
 * 다른 tick 은 건너뛴다), 임대를 걸고, 실행 기록(running)을 남긴다. 그래서 같은 회차는 한 번만
 * 실행된다. 서버가 실행 중에 죽으면 임대가 만료된 뒤 다시 집힌다 — 먼저 그 고아 기록을 닫는다.
 */
export async function claimDue(limit = 5, now: Date = new Date()): Promise<ClaimedRun[]> {
  // 임대가 만료된 약속의 running 기록 = 서버가 실행 중에 멈췄다. 실패로 닫는다.
  await db
    .update(promiseRuns)
    .set({ status: "failed", error: "서버가 실행 중에 멈췄어요.", finishedAt: now })
    .where(
      and(
        eq(promiseRuns.status, "running"),
        inArray(
          promiseRuns.promiseId,
          db.select({ id: promises.id }).from(promises).where(lt(promises.leaseUntil, now)),
        ),
      ),
    );

  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(promises)
      .where(
        and(
          eq(promises.enabled, true),
          lte(promises.nextRunAt, now),
          or(isNull(promises.leaseUntil), lt(promises.leaseUntil, now)),
        ),
      )
      .orderBy(asc(promises.nextRunAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const claimed: ClaimedRun[] = [];
    for (const p of due) {
      const runId = randomUUID();
      const scheduledFor = p.nextRunAt ?? now;
      await tx.update(promises).set({ leaseUntil }).where(eq(promises.id, p.id));
      await tx.insert(promiseRuns).values({
        id: runId,
        promiseId: p.id,
        userId: p.userId,
        scheduledFor,
        startedAt: now,
        status: "running",
      });
      claimed.push({ runId, scheduledFor, startedAt: now, promise: { ...p, leaseUntil } });
    }
    return claimed;
  });
}

/** 한 회차의 결과. */
export type RunOutcome = {
  status: Exclude<PromiseRunStatus, "running">;
  error?: string;
  messageId?: string;
  /** 실행 중 set_memo 로 바뀐 메모. 없으면 그대로. */
  memo?: string;
  /** 실행 중 finish 로 약속을 끝냈는가. */
  finished?: boolean;
};

/**
 * 실행을 마무리한다 — 기록을 닫고, 다음 회차를 정하고, 임대를 푼다.
 *
 * - 한 번짜리이거나 finish 를 불렀으면 끝난다. 실패한 한 번짜리도 끝난다 — 다시 돌릴 시각이 없다.
 * - 반복 약속은 지금 이후 첫 회차로 간다(놓친 회차를 몰아서 돌리지 않는다, FR-016).
 * - 반복 약속이 연속 MAX_CONSECUTIVE_FAILURES 회 실패하면 끈다(R11). 알리는 일은 호출부가 한다.
 *
 * @returns 연속 실패로 꺼졌는지
 */
export async function complete(
  run: ClaimedRun,
  outcome: RunOutcome,
  now: Date = new Date(),
): Promise<{ disabledByFailures: boolean }> {
  const p = run.promise;
  const failures = outcome.status === "failed" ? p.consecutiveFailures + 1 : 0;
  const schedule = scheduleOf(p);
  const ends = outcome.finished === true || schedule.kind === "once";
  const disabledByFailures = !ends && failures >= MAX_CONSECUTIVE_FAILURES;
  const next = ends || disabledByFailures ? null : nextRunAfter(schedule, now);

  await db.transaction(async (tx) => {
    await tx
      .update(promiseRuns)
      .set({
        status: outcome.status,
        error: outcome.error ?? null,
        messageId: outcome.messageId ?? null,
        finishedAt: now,
      })
      .where(eq(promiseRuns.id, run.runId));

    await tx
      .update(promises)
      .set({
        lastRunAt: run.startedAt,
        leaseUntil: null,
        consecutiveFailures: failures,
        nextRunAt: next,
        ...(outcome.memo !== undefined ? { memo: outcome.memo } : {}),
        ...(ends || disabledByFailures || !next ? { enabled: false } : {}),
        ...(ends ? { endedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(promises.id, p.id));

    // 최근 RUNS_KEPT 개만 남긴다.
    const keep = tx
      .select({ id: promiseRuns.id })
      .from(promiseRuns)
      .where(eq(promiseRuns.promiseId, p.id))
      .orderBy(desc(promiseRuns.startedAt))
      .limit(RUNS_KEPT);
    await tx
      .delete(promiseRuns)
      .where(and(eq(promiseRuns.promiseId, p.id), notInArray(promiseRuns.id, keep)));
  });

  return { disabledByFailures };
}

/** 직전 실행(이번 것 제외) — 약속 턴 프롬프트의 "지난 실행" 줄. */
export async function previousRun(
  promiseId: string,
  exceptRunId: string,
): Promise<PromiseRunSummary | null> {
  const [row] = await db
    .select({ startedAt: promiseRuns.startedAt, status: promiseRuns.status, error: promiseRuns.error })
    .from(promiseRuns)
    .where(and(eq(promiseRuns.promiseId, promiseId), ne(promiseRuns.id, exceptRunId)))
    .orderBy(desc(promiseRuns.startedAt))
    .limit(1);
  return row
    ? { startedAt: row.startedAt.toISOString(), status: row.status as PromiseRunStatus, error: row.error }
    : null;
}
