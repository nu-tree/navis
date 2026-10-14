// specs/003 T022 · T036 — 약속 선점 · 완료(R3 · R11). 행 잠금(SKIP LOCKED)과 임대는 mock 으로 알 수 없어
// **실제 Postgres** 를 쓴다. DATABASE_URL 이 없으면 건너뛴다.
//
// claimDue 는 모든 회원의 약속을 본다 — 결과는 테스트 회원의 것만 골라 확인한다.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, promiseRuns, promises } from "@navis/db";
import { TEST_USERS, USER_A } from "../test-users";
import { MAX_CONSECUTIVE_FAILURES, claimDue, complete, create } from "../../src/promise/index";
import { PromiseLimitError } from "../../src/errors";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const NOW = new Date("2026-10-14T12:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

type Seed = Partial<typeof promises.$inferInsert>;

/** 시험용 약속을 바로 넣는다 — next_run_at · 임대를 원하는 대로 두려고. */
const seed = async (over: Seed = {}) => {
  const [row] = await db
    .insert(promises)
    .values({
      id: randomUUID(),
      userId: USER_A,
      instruction: "시험 약속",
      label: "시험",
      scheduleKind: "cron",
      cron: "0 * * * *",
      nextRunAt: minutes(-1),
      ...over,
    })
    .returning();
  if (!row) throw new Error("seed 실패");
  return row;
};

const mine = (ids: string[]) => (r: { promise: { id: string } }) => ids.includes(r.promise.id);

describeDb("claimDue — 선점 (실제 DB)", () => {
  afterEach(async () => {
    await db.delete(promises).where(inArray(promises.userId, [...TEST_USERS]));
  });

  it("기한이 된 켜진 약속만 집는다", async () => {
    const due = await seed();
    const later = await seed({ nextRunAt: minutes(10) });
    const off = await seed({ enabled: false });
    const claimed = (await claimDue(5, NOW)).filter(mine([due.id, later.id, off.id]));
    expect(claimed.map((c) => c.promise.id)).toEqual([due.id]);
  });

  it("동시에 두 번 불러도 같은 약속은 한 번만 나온다", async () => {
    const ids = await Promise.all([seed(), seed(), seed()]).then((rows) => rows.map((r) => r.id));
    const [a, b] = await Promise.all([claimDue(5, NOW), claimDue(5, NOW)]);
    const got = [...a, ...b].filter(mine(ids)).map((c) => c.promise.id);
    expect(got.sort()).toEqual([...ids].sort());
  });

  it("선점하면 임대가 걸리고 running 기록이 생긴다 — 다시 불러도 안 나온다", async () => {
    const p = await seed();
    const [claimed] = (await claimDue(5, NOW)).filter(mine([p.id]));
    expect(claimed?.scheduledFor).toEqual(p.nextRunAt);
    const [run] = await db.select().from(promiseRuns).where(eq(promiseRuns.promiseId, p.id));
    expect(run?.status).toBe("running");
    expect((await claimDue(5, minutes(1))).filter(mine([p.id]))).toHaveLength(0);
  });

  it("임대가 만료되면(서버가 실행 중에 멈춤) 고아 기록을 실패로 닫고 다시 집는다", async () => {
    const p = await seed();
    await claimDue(5, NOW);
    const again = (await claimDue(5, minutes(16))).filter(mine([p.id]));
    expect(again).toHaveLength(1);
    const runs = await db.select().from(promiseRuns).where(eq(promiseRuns.promiseId, p.id));
    expect(runs.map((r) => r.status).sort()).toEqual(["failed", "running"]);
    expect(runs.find((r) => r.status === "failed")?.error).toMatch(/멈췄/);
  });

  it("한 번에 limit 개까지만", async () => {
    const ids = await Promise.all(Array.from({ length: 7 }, () => seed())).then((r) => r.map((x) => x.id));
    expect((await claimDue(5, NOW)).filter(mine(ids)).length).toBeLessThanOrEqual(5);
  });
});

describeDb("complete — 마무리 (실제 DB)", () => {
  afterEach(async () => {
    // 메인 방은 지우지 않는다 — complete 는 방을 만들지 않고, 대화방 테스트가 같은 시험 회원의 메인 방을
    // 동시에 쓴다(파일끼리 병렬로 돈다). 여기서 지우면 그쪽이 간헐적으로 깨진다.
    await db.delete(promises).where(inArray(promises.userId, [...TEST_USERS]));
  });

  const claimOne = async (id: string, at = NOW) => {
    const [c] = (await claimDue(5, at)).filter(mine([id]));
    if (!c) throw new Error("선점 실패");
    return c;
  };

  it("한 번짜리는 실행하면 끝난다 — 실패해도", async () => {
    const p = await seed({ scheduleKind: "once", cron: null, runAt: minutes(-1) });
    await complete(await claimOne(p.id), { status: "failed", error: "x" }, NOW);
    const [row] = await db.select().from(promises).where(eq(promises.id, p.id));
    expect(row).toMatchObject({ enabled: false, nextRunAt: null, leaseUntil: null });
    expect(row?.endedAt).not.toBeNull();
  });

  it("반복 약속은 지금 이후 첫 회차로 가고 메모를 남긴다", async () => {
    const p = await seed();
    await complete(await claimOne(p.id), { status: "silent", memo: "68.2" }, NOW);
    const [row] = await db.select().from(promises).where(eq(promises.id, p.id));
    expect(row?.nextRunAt).toEqual(new Date("2026-10-14T13:00:00Z"));
    expect(row).toMatchObject({ memo: "68.2", enabled: true, leaseUntil: null, consecutiveFailures: 0 });
    const [run] = await db.select().from(promiseRuns).where(eq(promiseRuns.promiseId, p.id));
    expect(run?.status).toBe("silent");
  });

  it("finish 를 불렀으면 반복 약속도 끝난다", async () => {
    const p = await seed();
    await complete(await claimOne(p.id), { status: "spoke", finished: true }, NOW);
    const [row] = await db.select().from(promises).where(eq(promises.id, p.id));
    expect(row).toMatchObject({ enabled: false, nextRunAt: null });
    expect(row?.endedAt).not.toBeNull();
  });

  it(`반복 약속이 연속 ${MAX_CONSECUTIVE_FAILURES}회 실패하면 꺼진다 · 성공하면 다시 0부터`, async () => {
    const p = await seed({ consecutiveFailures: 1 });
    expect((await complete(await claimOne(p.id), { status: "silent" }, NOW)).disabledByFailures).toBe(false);

    await db.update(promises).set({ nextRunAt: NOW }).where(eq(promises.id, p.id));
    await complete(await claimOne(p.id), { status: "failed", error: "a" }, NOW);
    await db.update(promises).set({ nextRunAt: NOW }).where(eq(promises.id, p.id));
    await complete(await claimOne(p.id), { status: "failed", error: "b" }, NOW);
    await db.update(promises).set({ nextRunAt: NOW }).where(eq(promises.id, p.id));
    const last = await complete(await claimOne(p.id), { status: "failed", error: "c" }, NOW);

    expect(last.disabledByFailures).toBe(true);
    const [row] = await db.select().from(promises).where(eq(promises.id, p.id));
    expect(row).toMatchObject({ enabled: false, nextRunAt: null, consecutiveFailures: 3, endedAt: null });
  });

  it("실행 기록은 약속마다 최근 20개만 남는다", async () => {
    const p = await seed();
    for (let i = 0; i < 22; i++) {
      await db.update(promises).set({ nextRunAt: NOW }).where(eq(promises.id, p.id));
      await complete(await claimOne(p.id, minutes(i)), { status: "silent" }, minutes(i));
    }
    const runs = await db.select().from(promiseRuns).where(eq(promiseRuns.promiseId, p.id));
    expect(runs).toHaveLength(20);
  });
});

describeDb("create — 상한 (실제 DB)", () => {
  afterEach(async () => {
    await db.delete(promises).where(inArray(promises.userId, [...TEST_USERS]));
  });

  it("켜진 약속이 20개면 21번째는 PromiseLimitError", async () => {
    await Promise.all(Array.from({ length: 20 }, () => seed()));
    await expect(
      create(USER_A, { instruction: "x", label: "x", schedule: { cron: "0 9 * * *" } }, null, NOW),
    ).rejects.toBeInstanceOf(PromiseLimitError);
  });

  it("꺼진 약속은 상한에 세지 않는다", async () => {
    await Promise.all(Array.from({ length: 20 }, () => seed({ enabled: false })));
    const { promise } = await create(
      USER_A,
      { instruction: "x", label: "x", schedule: { cron: "0 9 * * *" } },
      null,
      NOW,
    );
    expect(promise.nextRunAt).toBe("2026-10-15T00:00:00.000Z");
  });
});

