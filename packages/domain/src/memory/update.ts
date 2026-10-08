// 기억 수정(FR-023, FR-024, FR-027).
//
// ★ content 를 바꾸면 임베딩을 다시 계산한다. 안 하면 고친 내용으로 검색되지 않는다 —
//   목록엔 새 문장이 보이는데 검색은 옛 문장의 벡터로 찾는다(FR-024).
//   다른 필드(분류 · 태그 · 완료)만 바꿀 때는 임베딩을 건드리지 않는다 — 비용이 들고 결과가 같다.
//
// ★ metadata 는 통째로 덮지 않고 병합한다. 태그만 고쳤는데 done 이 사라지면 안 된다.

import { eq } from "drizzle-orm";
import { db, memories } from "@navis/db";
import type { Memory, UpdateInput } from "@navis/validation";
import { NotFoundError } from "../errors";
import { embed } from "./embed";
import { assertMemoryId, mergeMetadata, normalizeProject, toMemory, type MemoryRow } from "./mapping";

const COLUMNS = {
  id: memories.id,
  content: memories.content,
  category: memories.category,
  project: memories.project,
  metadata: memories.metadata,
  createdAt: memories.createdAt,
} as const;

export async function update(input: UpdateInput): Promise<Memory> {
  assertMemoryId(input.id);
  const [current] = await db
    .select({ content: memories.content, metadata: memories.metadata })
    .from(memories)
    .where(eq(memories.id, input.id));
  if (!current) throw new NotFoundError("memory", input.id);

  const content = input.content?.trim();
  if (input.content !== undefined && !content) {
    // 스키마의 min(1) 은 공백만 든 문자열을 통과시킨다. 빈 기억은 검색도 안 되고 의미도 없다.
    throw new Error("빈 내용으로 바꿀 수 없다.");
  }
  const contentChanged = content !== undefined && content !== current.content;

  const project = normalizeProject(input.project);

  const [row] = await db
    .update(memories)
    .set({
      ...(contentChanged ? { content, embedding: await embed(content, { inputType: "document" }) } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(project !== undefined ? { project } : {}),
      metadata: mergeMetadata(current.metadata, {
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.done !== undefined ? { done: input.done } : {}),
        ...(input.relatedIds !== undefined ? { relatedIds: input.relatedIds } : {}),
        // 할 일로 바꾸면 미완료로 시작한다(save 와 같은 규칙). 이미 done 이 있으면 그대로 둔다.
        ...(input.category === "todo" && input.done === undefined ? { done: false } : {}),
      }),
    })
    .where(eq(memories.id, input.id))
    .returning(COLUMNS);

  // select 와 update 사이에 지워졌다.
  if (!row) throw new NotFoundError("memory", input.id);
  return toMemory(row satisfies MemoryRow);
}
