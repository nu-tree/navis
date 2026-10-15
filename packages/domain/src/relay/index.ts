// 전하기 — 넣기 · 보기, 그리고 실행의 선점 · 완료(specs/004).
//
// 넣는 입구는 둘(관리자 화면 · 관리자 대화 도구)이고 둘 다 pending 행을 넣기만 한다. 실행은 tick 이
// 약속과 함께 집어 같은 실행기 큐에서 돌린다(research R2). 실행 자체는 ./run.ts, 도구는 ./mcp.ts.
//
// 관리자 판정은 여기서 하지 않는다 — domain 은 관리자가 누구인지 모른다. server 가 걸러서 부른다.

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, notInArray } from "drizzle-orm";
import { db, relays } from "@navis/db";
import type { Member, RelayItem, RelayStatus } from "@navis/validation";
import { ClaudeTokenMissingError } from "../errors";
import { LEASE_MS } from "../promise/index";
import { claudeToken } from "../settings";

type Row = typeof relays.$inferSelect;

/** 보낸 관리자마다 남기는 끝난 전하기 수. */
export const RELAYS_KEPT = 50;

const FINISHED: RelayStatus[] = ["delivered", "failed"];

/**
 * 행 → 와이어. ★ messageId 는 싣지 않는다 — 관리자에게 돌아가는 것은 상태뿐이다(FR-019).
 * 그 id 로 할 수 있는 일은 없지만, 지어진 문장에 닿는 손잡이를 만들지 않는다.
 */
const toItem = (row: Row): RelayItem => ({
  id: row.id,
  to: row.recipientLabel,
  instruction: row.instruction,
  status: row.status as RelayStatus,
  error: row.error,
  createdAt: row.createdAt.toISOString(),
  finishedAt: row.finishedAt?.toISOString() ?? null,
});

/**
 * 전하기 하나를 맡긴다. 관리자의 토큰이 없으면 넣지 않는다(FR-023) — 받는 회원의 토큰으로 대신 돌리지
 * 않으므로, 넣어 봐야 실패할 것을 미리 알린다.
 */
export async function create(senderId: string, recipient: Member, instruction: string): Promise<RelayItem> {
  if (!(await claudeToken.resolve(senderId))) throw new ClaudeTokenMissingError();

  const [row] = await db
    .insert(relays)
    .values({
      id: randomUUID(),
      senderId,
      recipientId: recipient.id,
      recipientLabel: recipient.label,
      instruction,
      status: "pending",
    })
    .returning();
  if (!row) throw new Error("전하기를 넣지 못했다.");

  // 보존: 최근 RELAYS_KEPT 개 밖의 끝난 행을 지운다. 끝나지 않은 것은 지우지 않는다 — 아직 돌고 있다.
  const kept = db
    .select({ id: relays.id })
    .from(relays)
    .where(eq(relays.senderId, senderId))
    .orderBy(desc(relays.createdAt))
    .limit(RELAYS_KEPT);
  await db
    .delete(relays)
    .where(and(eq(relays.senderId, senderId), inArray(relays.status, FINISHED), notInArray(relays.id, kept)));

  return toItem(row);
}

/** 보낸 관리자의 최근 전하기, 최신순. */
export async function list(senderId: string, limit = RELAYS_KEPT): Promise<RelayItem[]> {
  const rows = await db
    .select()
    .from(relays)
    .where(eq(relays.senderId, senderId))
    .orderBy(desc(relays.createdAt))
    .limit(limit);
  return rows.map(toItem);
}

/** 선점한 전하기 — 실행에 필요한 것 전부. */
export type ClaimedRelay = Pick<Row, "id" | "senderId" | "recipientId" | "instruction">;

/**
 * 기다리는 전하기를 선점한다. 한 트랜잭션에서 행을 잠가 고르고(SKIP LOCKED) running + 임대를 건다.
 *
 * ★ 임대가 만료된 running 은 다시 집지 않고 실패로 닫는다. 약속과 다르다 — deliver 는 했는데 기록 직전에
 *   서버가 죽었다면, 다시 집는 순간 같은 말을 두 번 전한다. 약속은 회차 기록으로 막지만 전하기는 한 번짜리라
 *   닫고 관리자가 판단하게 하는 편이 단순하다.
 */
export async function claimPending(limit = 5, now: Date = new Date()): Promise<ClaimedRelay[]> {
  await db
    .update(relays)
    .set({ status: "failed", error: "서버가 실행 중에 멈췄어요.", finishedAt: now, leaseUntil: null })
    .where(and(eq(relays.status, "running"), lt(relays.leaseUntil, now)));

  if (limit <= 0) return [];
  return db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: relays.id,
        senderId: relays.senderId,
        recipientId: relays.recipientId,
        instruction: relays.instruction,
      })
      .from(relays)
      .where(eq(relays.status, "pending"))
      .orderBy(asc(relays.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (!due.length) return [];

    await tx
      .update(relays)
      .set({ status: "running", leaseUntil: new Date(now.getTime() + LEASE_MS) })
      .where(inArray(relays.id, due.map((r) => r.id)));
    return due;
  });
}

export type RelayOutcome = { status: "delivered"; messageId: string } | { status: "failed"; error: string };

/** 한 전하기를 끝낸다. */
export async function complete(id: string, outcome: RelayOutcome, now: Date = new Date()): Promise<void> {
  await db
    .update(relays)
    .set({
      status: outcome.status,
      ...(outcome.status === "delivered" ? { messageId: outcome.messageId } : { error: outcome.error }),
      finishedAt: now,
      leaseUntil: null,
    })
    .where(eq(relays.id, id));
}
