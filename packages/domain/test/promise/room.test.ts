// 2026-11-13 — 방별 약속(오른쪽 패널)과 약속이 오는 방. 만든 방이 지워졌는지는 실제 DB 로만 알 수 있다.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { conversations, db, promises } from "@navis/db";
import { USER_B } from "../test-users";

// ★ 다른 실DB 테스트(claim.test 등)는 TEST_USERS 의 약속을 afterEach 에서 통째로 지운다. 파일끼리 나란히 돌아
//   같은 회원을 쓰면 서로의 약속을 지워 버린다(실측) — 이 파일만 쓰는 회원을 둔다.
const USER_A = "00000000-0000-4000-8000-0000000000a3";

import { listForRoom } from "../../src/promise/index";
import { deliveryRoom } from "../../src/promise/deliver";
import { create as createRoom, ensureMain } from "../../src/conversation/index";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const seed = async (originConversationId: string | null, over: Partial<typeof promises.$inferInsert> = {}) => {
  const [row] = await db
    .insert(promises)
    .values({
      id: randomUUID(),
      userId: USER_A,
      instruction: "시험 약속",
      label: "시험",
      scheduleKind: "cron",
      cron: "0 9 * * *",
      nextRunAt: new Date(Date.now() + 3_600_000),
      originConversationId,
      ...over,
    })
    .returning();
  if (!row) throw new Error("seed 실패");
  return row;
};

describeDb("방별 약속 · 약속이 오는 방 (실제 DB)", () => {
  const rooms: string[] = [];
  afterEach(async () => {
    await db.delete(promises).where(eq(promises.userId, USER_A));
    await db.delete(conversations).where(eq(conversations.userId, USER_A));
    if (rooms.length) await db.delete(conversations).where(inArray(conversations.id, rooms.splice(0)));
  });

  it("주제 방은 그 방에서 만든 켜진 약속만, 메인 방은 만든 방이 없거나 지워진 약속까지", async () => {
    const main = await ensureMain(USER_A);
    const topic = await createRoom(USER_A, "강의 준비");
    const gone = await createRoom(USER_A, "지울 방");
    rooms.push(topic.id, gone.id);

    const inTopic = await seed(topic.id);
    const inMain = await seed(main.id);
    const legacy = await seed(null);
    const orphan = await seed(gone.id);
    const off = await seed(topic.id, { enabled: false });
    await db.delete(conversations).where(eq(conversations.id, gone.id));

    const topicIds = (await listForRoom(USER_A, topic.id, { isMain: false })).map((p) => p.id);
    expect(topicIds).toEqual([inTopic.id]);
    expect(topicIds).not.toContain(off.id);

    const mainIds = (await listForRoom(USER_A, main.id, { isMain: true })).map((p) => p.id).sort();
    expect(mainIds).toEqual([inMain.id, legacy.id, orphan.id].sort());
  });

  it("약속은 만든 방으로 — 지워졌거나 남의 방이면 메인 방으로", async () => {
    const main = await ensureMain(USER_A);
    const topic = await createRoom(USER_A, "이사");
    const others = await createRoom(USER_B, "남의 방");
    rooms.push(topic.id, others.id);

    expect(await deliveryRoom(USER_A, topic.id)).toEqual({ id: topic.id, topic: "이사", isMain: false });
    expect((await deliveryRoom(USER_A, others.id)).id).toBe(main.id);
    expect((await deliveryRoom(USER_A, null)).id).toBe(main.id);
    expect((await deliveryRoom(USER_A, "없는-방")).id).toBe(main.id);
  });
});
