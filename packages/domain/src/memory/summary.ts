// 기억 요약 — 최근 N일 동안 분류별로 몇 개 쌓였나. 기억 화면 맨 위에 한눈에 보인다.

import { and, count, gte, sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import { categorySchema, type MemorySummary } from "@navis/validation";
import { ownedBy } from "./scope";

export async function summary(userId: string, days: number): Promise<MemorySummary> {
  const rows = await db
    .select({ category: memories.category, n: count() })
    .from(memories)
    .where(and(ownedBy(userId), gte(memories.createdAt, sql`now() - make_interval(days => ${days})`)))
    .groupBy(memories.category);

  const byCategory: MemorySummary["byCategory"] = {};
  for (const { category, n } of rows) {
    // 알 수 없는 분류(예전 데이터)는 '분류 없음'으로 센다.
    const key = categorySchema.safeParse(category).success ? (category as keyof typeof byCategory) : "none";
    byCategory[key] = (byCategory[key] ?? 0) + n;
  }
  return { days, total: rows.reduce((sum, r) => sum + r.n, 0), byCategory };
}
