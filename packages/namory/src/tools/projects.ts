import { isNotNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories } from "../db/schema.js";

// 사용 중인 프로젝트(distinct, non-null) 목록 + 각 개수. 많이 쓰인 순.
// navis 가 저장 시 모델에게 "기존 표기를 재사용하라"고 주입하는 데 쓴다
// (나비스↔navis 같은 표기 분기 방지 — 하드코딩 별칭 없이 데이터에서 자기수렴).
export async function listProjects(): Promise<{ project: string; count: number }[]> {
  const rows = await db
    .select({
      project: memories.project,
      count: sql<number>`count(*)::int`,
    })
    .from(memories)
    .where(isNotNull(memories.project))
    .groupBy(memories.project)
    .orderBy(sql`count(*) desc`);
  return rows
    .filter((r): r is { project: string; count: number } => !!r.project)
    .map((r) => ({ project: r.project, count: r.count }));
}
