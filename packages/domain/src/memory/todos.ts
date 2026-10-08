// 할 일 기억(FR-026). 기본은 미완료만, includeDone 이면 완료된 것도 함께.
//
// done 은 metadata jsonb 안에 있다. 없는 경우(예전 데이터)는 미완료로 본다 — toMemory 와 같은 규칙.

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import type { Memory, TodosInput } from "@navis/validation";
import { toMemory, type MemoryRow } from "./mapping";

const DEFAULT_LIMIT = 100;

export async function todos(input: TodosInput = {}): Promise<Memory[]> {
  const conditions = [
    eq(memories.category, "todo"),
    input.includeDone
      ? undefined
      : sql`coalesce((${memories.metadata} ->> 'done')::boolean, false) = false`,
    // 프로젝트가 주어지면 "그 프로젝트 + 개인 기억"(FR-018) — recent · recall 과 같은 규칙.
    input.project
      ? or(eq(memories.project, input.project), isNull(memories.project))
      : undefined,
  ].filter((c) => c !== undefined);

  const rows = await db
    .select({
      id: memories.id,
      content: memories.content,
      category: memories.category,
      project: memories.project,
      metadata: memories.metadata,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt))
    .limit(input.limit ?? DEFAULT_LIMIT);

  return rows.map((row) => toMemory(row satisfies MemoryRow));
}
