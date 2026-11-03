// 기억 요약 — 최근 N일 동안 분류별로 몇 개 쌓였나. 기억 화면 "한눈에"에 보인다.

import { and, count, gte, sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import { categorySchema, type MemorySummary } from "@navis/validation";
import { kstDate, parseSince } from "./range";
import { ownedBy } from "./scope";

type CategoryCounts = MemorySummary["byCategory"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 알 수 없는 분류(예전 데이터)는 '분류 없음'으로 센다. */
const tally = (into: CategoryCounts, category: string | null, n: number) => {
  const key = categorySchema.safeParse(category).success ? (category as keyof CategoryCounts) : "none";
  into[key] = (into[key] ?? 0) + n;
};

export async function summary(userId: string, days: number, now: Date = new Date()): Promise<MemorySummary> {
  const rows = await db
    .select({ category: memories.category, n: count() })
    .from(memories)
    .where(and(ownedBy(userId), gte(memories.createdAt, sql`now() - make_interval(days => ${days})`)))
    .groupBy(memories.category);

  const byCategory: CategoryCounts = {};
  for (const { category, n } of rows) tally(byCategory, category, n);

  // 날짜별 — 막대 그래프용. 위의 합계는 "지금부터 N×24시간"이고, 이건 한국 달력 날짜 N칸(오늘 포함)이다.
  // 막대는 날짜로 끊겨야 읽히고, 합계는 기간 필터(days)와 같은 기준이어야 눌렀을 때 숫자가 맞는다.
  const dates = Array.from({ length: days }, (_, i) => kstDate(new Date(now.getTime() - (days - 1 - i) * DAY_MS)));
  const day = sql<string>`to_char(${memories.createdAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`;
  const dayRows = await db
    .select({ day, category: memories.category, n: count() })
    .from(memories)
    .where(and(ownedBy(userId), gte(memories.createdAt, parseSince(dates[0]!, now))))
    .groupBy(day, memories.category);

  const byDay = dates.map((date) => ({ date, byCategory: {} as CategoryCounts }));
  const index = new Map(byDay.map((d) => [d.date, d.byCategory]));
  for (const r of dayRows) {
    const bucket = index.get(r.day);
    if (bucket) tally(bucket, r.category, r.n);
  }

  return { days, total: rows.reduce((sum, r) => sum + r.n, 0), byCategory, byDay };
}
