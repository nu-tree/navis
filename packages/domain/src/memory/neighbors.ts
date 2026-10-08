// 겹치는 기억 찾기(FR-047, R7) — "이 기억의 이웃".
//
// ★ 그 기억의 벡터로 **같은 HNSW 인덱스를 다시 탄다**. 전체 쌍 비교(O(n²))나 클러스터링을
//   하지 않는다 — 비용이 기존 검색 한 번과 같다. 사용자는 목록 → 항목 → 이웃 → 정리 순으로 훑는다.
//
// 시간 가중치(rerank)는 쓰지 않는다. 겹침을 찾는 것이라 "비슷한가"만 본다.

import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import type { RecallHit } from "@navis/validation";
import { NotFoundError } from "../errors";
import { assertMemoryId, toMemory, type MemoryRow } from "./mapping";
import { ownedBy } from "./scope";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export async function neighbors(
  userId: string,
  id: string,
  limit = DEFAULT_LIMIT,
): Promise<RecallHit[]> {
  assertMemoryId(id);
  const [self] = await db
    .select({ id: memories.id, hasEmbedding: sql<boolean>`${memories.embedding} is not null` })
    .from(memories)
    // 남의 기억을 기준으로 이웃을 부를 수 없다 — 없는 것과 같다(specs/002 FR-103).
    .where(and(eq(memories.id, id), ownedBy(userId)));
  if (!self) throw new NotFoundError("memory", id);
  // 임베딩이 없는 기억(재임베딩 전 등)은 비교할 벡터가 없다. 오류가 아니라 이웃 없음이다.
  if (!self.hasEmbedding) return [];

  // 벡터를 앱으로 가져오지 않는다 — 서브쿼리로 DB 안에서 그대로 쓴다.
  const target = sql`(select ${memories.embedding} from ${memories} where ${memories.id} = ${id} and ${memories.userId} = ${userId})`;
  const k = Math.min(Math.max(limit, 1), MAX_LIMIT);

  const rows = await db.transaction(async (tx) => {
    // 회원 조건으로 후보가 모자라지 않게 더 탐색한다(recall.ts 와 같은 이유, specs/002 R5).
    await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
    return tx
    .select({
      id: memories.id,
      content: memories.content,
      category: memories.category,
      project: memories.project,
      metadata: memories.metadata,
      createdAt: memories.createdAt,
      score: sql<number>`1 - (${memories.embedding} <=> ${target})`,
    })
    .from(memories)
    .where(and(ownedBy(userId), isNotNull(memories.embedding), ne(memories.id, id)))
    // 거리 연산자를 그대로 ORDER BY 에 둬야 인덱스를 탄다(recall.ts 주석).
    .orderBy(sql`${memories.embedding} <=> ${target}`)
    .limit(k);
  });

  return rows.map(({ score, ...row }) => ({
    memory: toMemory(row satisfies MemoryRow),
    score: Number(score),
  }));
}
