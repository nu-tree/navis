// 최근 기억 조회.
//
// US1 에서는 저장이 실제로 됐는지 확인하는 최소 조회로 쓰인다.
// 필터(분류·프로젝트·기간) 전체는 US4 의 기억 화면에서 채운다.

import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import type { Memory, RecentInput } from "@navis/validation";
import { toMemory, type MemoryRow } from "./mapping";

/** 기본 개수. recentInputSchema 의 상한은 200 이다. */
const DEFAULT_LIMIT = 50;

/** 밖으로 내보내는 열만 고른다 — embedding 은 싣지 않는다. */
const COLUMNS = {
  id: memories.id,
  content: memories.content,
  category: memories.category,
  project: memories.project,
  metadata: memories.metadata,
  createdAt: memories.createdAt,
} as const;

export async function recent(input: RecentInput = {}): Promise<Memory[]> {
  const conditions = [
    input.category ? eq(memories.category, input.category) : undefined,
    // 프로젝트가 주어지면 "그 프로젝트 + 개인 기억"으로 좁힌다 —
    // 개인 기억을 빼면 프로젝트 맥락에서 사용자 자신에 관한 것을 못 본다(FR-018).
    input.project
      ? or(eq(memories.project, input.project), isNull(memories.project))
      : undefined,
    input.days
      ? gte(memories.createdAt, sql`now() - make_interval(days => ${input.days})`)
      : undefined,
  ].filter((c) => c !== undefined);

  const rows = await db
    .select(COLUMNS)
    .from(memories)
    .where(conditions.length ? and(...conditions) : undefined)
    // memories_created_at_idx 가 created_at DESC 로 있다.
    .orderBy(desc(memories.createdAt))
    .limit(input.limit ?? DEFAULT_LIMIT);

  return rows.map((row) => toMemory(row satisfies MemoryRow));
}
