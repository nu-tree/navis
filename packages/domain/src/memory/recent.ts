// 최근 기억 조회.
//
// 기간(since · until)을 주면 그 기간 기억을 **전건** 돌려준다 — 유사도 컷이 없다.
// "오늘 한 일 정리"를 recall 로 하면 의미 top-N 만 올라와 그날 기억 일부를 놓친다(2026-10-07).

import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import type { Memory, RecentInput } from "@navis/validation";
import { toMemory, type MemoryRow } from "./mapping";
import { parseSince, parseUntil } from "./range";

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
    input.since ? gte(memories.createdAt, parseSince(input.since)) : undefined,
    input.until ? lt(memories.createdAt, parseUntil(input.until)) : undefined,
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
