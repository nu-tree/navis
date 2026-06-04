import { gte, desc, and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories, type Category } from "../db/schema.js";
import { projectFilter } from "./filter.js";

// 기억 페이지용 — 기간 제한 없이 최신순 전체(또는 project) 조회. tags 표시용 metadata 포함.
export async function listMemories(args: { limit?: number; project?: string }) {
  return db
    .select({
      id: memories.id,
      content: memories.content,
      category: memories.category,
      project: memories.project,
      metadata: memories.metadata,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(projectFilter(args.project))
    .orderBy(desc(memories.createdAt))
    .limit(args.limit ?? 500);
}

export async function recent(args: {
  days?: number;
  limit?: number;
  category?: Category;
  project?: string;
}) {
  const since = new Date(Date.now() - (args.days ?? 7) * 86_400_000);
  return db
    .select({
      id: memories.id,
      content: memories.content,
      category: memories.category,
      project: memories.project,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(
      and(
        gte(memories.createdAt, since),
        args.category ? eq(memories.category, args.category) : undefined,
        projectFilter(args.project),
      ),
    )
    .orderBy(desc(memories.createdAt))
    .limit(args.limit ?? 50);
}
