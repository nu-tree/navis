// 기억 삭제(FR-025). 지운 기억은 목록과 이후 답변 근거(recall)에서 함께 사라진다 — 같은 행이다.

import { and, eq } from "drizzle-orm";
import { db, memories } from "@navis/db";
import { NotFoundError } from "../errors";
import { assertMemoryId } from "./mapping";
import { ownedBy } from "./scope";

export async function remove(userId: string, id: string): Promise<{ ok: true }> {
  assertMemoryId(id);
  const deleted = await db
    .delete(memories)
    // 남의 기억은 없는 것과 같다(specs/002 FR-103).
    .where(and(eq(memories.id, id), ownedBy(userId)))
    .returning({ id: memories.id });
  if (deleted.length === 0) throw new NotFoundError("memory", id);
  return { ok: true };
}
