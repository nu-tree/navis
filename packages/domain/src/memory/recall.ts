// 기억 불러오기 — 의미가 가까운 기억을 찾는다(FR-016~020).
//
// 두 단계로 나눈다(R6):
//   1) DB: HNSW 코사인 거리로 후보 N 건만. 순수 벡터 근접 질의다.
//   2) 앱: 시간 가중치로 재정렬(rerank.ts).
//
// 시간 가중치를 SQL `ORDER BY` 안에서 곱하면 memories_embedding_idx 를 타지 못하고
// 전체 스캔이 된다. 기억이 1천 건일 땐 티가 안 나지만 SC-007(1초/1,000건)을 인덱스
// 없이 지키는 건 규모가 커지면 무너진다.

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import type { RecallHit, RecallInput } from "@navis/validation";
import { embed } from "./embed";
import { toMemory, type MemoryRow } from "./mapping";
import { rerank } from "./rerank";

/** recallInputSchema 의 limit 상한과 반드시 일치해야 한다(FR-019). */
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

/**
 * 재정렬에 쓸 후보 배수.
 *
 * 시간 가중치가 순위를 바꾸므로, 최종 limit 만큼만 뽑으면 "유사도 5등이지만 최근이라
 * 1등이 됐어야 할" 기억이 후보에 들어오지 못한다. 넉넉히 뽑아 재정렬한다.
 */
const CANDIDATE_MULTIPLIER = 4;
const MAX_CANDIDATES = 200;

export async function recall(input: RecallInput): Promise<RecallHit[]> {
  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const candidates = Math.min(limit * CANDIDATE_MULTIPLIER, MAX_CANDIDATES);

  const vector = await embed(input.query, { inputType: "query" });
  const literal = sql`${JSON.stringify(vector)}::vector`;

  const conditions = [
    sql`${memories.embedding} is not null`,
    input.category ? eq(memories.category, input.category) : undefined,
    // 프로젝트가 주어지면 "그 프로젝트 + 개인 기억" 으로 좁힌다(FR-018).
    // 개인 기억을 빼면 프로젝트 맥락에서 사용자 자신에 관한 것을 못 본다.
    input.project
      ? or(eq(memories.project, input.project), isNull(memories.project))
      : undefined,
  ].filter((c) => c !== undefined);

  // ★ hnsw.ef_search 기본값은 40 이다. 후보를 그보다 많이 요청하면 인덱스가 쓰이는
  //   순간 나머지는 무의미해진다 — pgvector 는 근사 검색이고 이 값이 탐색 폭이다.
  //
  //   지금은 행이 적어 플래너가 Seq Scan(정확 검색)을 고르므로 드러나지 않는다.
  //   규모가 커져 인덱스로 넘어갈 때 조용히 나빠지는 종류라 미리 맞춰둔다.
  //
  //   SET LOCAL 이라 트랜잭션이 끝나면 되돌아간다 — 커넥션 풀에 새지 않는다.
  //   BEGIN/COMMIT 왕복이 붙지만, 위의 임베딩 호출(~200ms)에 비하면 잡음이다.
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`set local hnsw.ef_search = ${sql.raw(String(candidates))}`);
    return tx
      .select({
        id: memories.id,
        content: memories.content,
        category: memories.category,
        project: memories.project,
        metadata: memories.metadata,
        createdAt: memories.createdAt,
        // 코사인 거리 → 유사도. 거리 연산자를 그대로 ORDER BY 에 써야 인덱스를 탄다.
        score: sql<number>`1 - (${memories.embedding} <=> ${literal})`,
      })
      .from(memories)
      .where(and(...conditions))
      .orderBy(sql`${memories.embedding} <=> ${literal}`)
      .limit(candidates);
  });

  const hits: RecallHit[] = rows.map(({ score, ...row }) => ({
    memory: toMemory(row satisfies MemoryRow),
    score: Number(score),
  }));

  return rerank(hits, { limit });
}
