// 내보내기(FR-050, FR-051, R8). 나비스 없이도 사람이 읽을 수 있게 들여쓴 JSON 한 파일.
//
// 기억이 0건이어도 실패하지 않는다 — count: 0, memories: [] 인 유효한 파일을 만든다.
// 임베딩은 싣지 않는다. 사람이 읽을 수 없고, 다시 계산할 수 있다.

import { asc } from "drizzle-orm";
import { db, memories } from "@navis/db";
import type { MemoryExport } from "@navis/validation";
import { toMemory, type MemoryRow } from "./mapping";
import { ownedBy } from "./scope";

export async function exportAll(userId: string, now: Date = new Date()): Promise<MemoryExport> {
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
    // 이 회원의 기억만 — 내보낸 파일에 남의 기억이 섞이면 안 된다(specs/002 FR-102).
    .where(ownedBy(userId))
    // 파일은 처음부터 읽힌다 — 오래된 것부터.
    .orderBy(asc(memories.createdAt));

  const list = rows.map((row) => toMemory(row satisfies MemoryRow));
  return { exportedAt: now.toISOString(), count: list.length, memories: list };
}

/** 파일 본문. 들여쓰기 2칸. */
export const serializeExport = (data: MemoryExport): string => `${JSON.stringify(data, null, 2)}\n`;
