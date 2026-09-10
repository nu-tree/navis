// 기억 저장.
//
// ★ 중복 판정을 하지 않는다(FR-011). 비슷한 기억이 이미 있어도 항상 새로 저장한다.
//   대화 흐름을 끊지 않는 것이 중복 없음보다 우선이라는 결정이다 — 대가는 기억 누적이고,
//   정리 책임은 기억 화면에 있다(FR-047).
//
//   예전 구현은 저장 경로에 유사도 검사를 두어 "이미 비슷한 게 있다"를 되돌려줬다.
//   그 갈래(saveResultSchema 의 skipped/duplicates)는 소비자를 잃어 접혔다.
//
//   부수 효과로 저장이 빨라진다 — 저장마다 벡터 검색을 한 번 덜 한다.

import { db, memories } from "@navis/db";
import type { Memory, SaveInput } from "@navis/validation";
import { embed } from "./embed";
import { toMemory, toMetadata, type MemoryRow } from "./mapping";

export async function save(input: SaveInput): Promise<Memory> {
  const content = input.content.trim();

  // 스키마가 min(1) 을 보장하지만 공백만 든 문자열은 통과한다. 임베딩이 불가능하고
  // 기억으로서도 무의미하므로 여기서 막는다.
  if (!content) {
    throw new Error("빈 내용은 저장할 수 없다.");
  }

  const embedding = await embed(content, { inputType: "document" });

  const [row] = await db
    .insert(memories)
    .values({
      content,
      category: input.category ?? null,
      project: input.project ?? null,
      embedding,
      metadata: toMetadata({
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.relatedIds ? { relatedIds: input.relatedIds } : {}),
        // 할 일로 저장되면 미완료로 시작한다. 다른 분류에는 done 을 넣지 않는다.
        ...(input.category === "todo" ? { done: false } : {}),
      }),
    })
    .returning({
      id: memories.id,
      content: memories.content,
      category: memories.category,
      project: memories.project,
      metadata: memories.metadata,
      createdAt: memories.createdAt,
    });

  if (!row) {
    // insert...returning 이 빈 배열을 주는 경우. noUncheckedIndexedAccess 가 이 분기를
    // 강제하는데, 실제로 일어나면 저장이 조용히 실패한 것이므로 던진다.
    throw new Error("기억을 저장했지만 결과를 돌려받지 못했다.");
  }

  return toMemory(row satisfies MemoryRow);
}
