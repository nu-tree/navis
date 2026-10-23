// 피드백 — 넣기 · 보기 · 처리 표시.
//
// 넣는 입구는 회원 대화 턴의 feedback 도구 하나다(./mcp.ts). 관리자는 ⋯ → '피드백' 화면에서만 본다 —
// 관리자 대화방에 메시지를 넣거나 알림을 보내지 않는다(2026-10-23 사용자 결정).
//
// 관리자 판정은 여기서 하지 않는다 — domain 은 관리자가 누구인지 모른다. server 가 걸러서 부른다.

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, feedbacks } from "@navis/db";
import type { FeedbackItem } from "@navis/validation";
import { NotFoundError } from "../errors";
import { list as listMembers } from "../member/index";

type Row = typeof feedbacks.$inferSelect;

/** 화면이 한 번에 보는 수. */
export const FEEDBACKS_SHOWN = 200;

const toItem = (row: Row): FeedbackItem => ({
  id: row.id,
  from: row.senderLabel,
  text: row.text,
  done: row.doneAt !== null,
  createdAt: row.createdAt.toISOString(),
});

/** 피드백 하나를 남긴다. 보낸 사람 표시는 회원 목록에서 찾고, 없으면 uuid 앞 8자. */
export async function create(senderId: string, text: string): Promise<FeedbackItem> {
  const me = (await listMembers()).find((m) => m.id === senderId.toLowerCase());
  const [row] = await db
    .insert(feedbacks)
    .values({ id: randomUUID(), senderId, senderLabel: me?.label ?? senderId.slice(0, 8), text })
    .returning();
  if (!row) throw new Error("피드백을 남기지 못했다.");
  return toItem(row);
}

/** 모든 회원의 피드백, 최신순. 관리자 화면 전용. */
export async function list(limit = FEEDBACKS_SHOWN): Promise<FeedbackItem[]> {
  const rows = await db.select().from(feedbacks).orderBy(desc(feedbacks.createdAt)).limit(limit);
  return rows.map(toItem);
}

/** 처리함 표시를 켜고 끈다. */
export async function setDone(id: string, done: boolean, now: Date = new Date()): Promise<FeedbackItem> {
  const [row] = await db
    .update(feedbacks)
    .set({ doneAt: done ? now : null })
    .where(eq(feedbacks.id, id))
    .returning();
  if (!row) throw new NotFoundError("feedback", id);
  return toItem(row);
}
