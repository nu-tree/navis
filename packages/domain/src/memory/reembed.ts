// 기억 전체 재임베딩.
//
// 임베딩 모델을 바꾸면 기존 벡터가 다른 공간에 남아 검색이 조용히 망가진다
// (실측: 코사인 유사도 0.5 → 0.06, 오류는 없음). 그래서 모델 교체는 항상
// "설정 변경 + 이 작업" 두 단계다.
//
// 비용: 기억 1천 건 ≈ 50만~70만 토큰. voyage-4 계열의 무료 200M 구간에서 0.3% 다.
// ★ Batch API 는 쓰지 않는다 — 무료 크레딧이 적용되지 않는다(Voyage 문서).

import { sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import { embedMany } from "./embed";

export type ReembedProgress = {
  done: number;
  total: number;
  /** 이번 묶음에서 건너뛴 건수(내용이 비어 임베딩할 수 없는 행). */
  skipped: number;
};

export type ReembedOptions = {
  /**
   * 한 번에 읽어 처리할 행 수. 임베딩 요청은 embedMany 가 상한에 맞춰 다시 나눈다.
   *
   * 기본값은 표준 한도를 전제한다. Voyage 계정에 결제수단이 없으면 **분당 3회 /
   * 10K 토큰**으로 묶이므로 그때는 `chunkSize: 6, pauseMs: 20_000` 으로 낮춘다
   * (CLI: `reembed <모델> 6 20000`). 한국어는 최악의 경우 글자당 1토큰이고 기억
   * 하나가 평균 500자라, 요청당 6건이면 ~3K 토큰으로 분당 9K 에 들어맞는다.
   */
  chunkSize?: number;
  /** 청크 사이에 쉴 시간(ms). 분당 요청 수 한도를 지킬 때만 필요하다. */
  pauseMs?: number;
  /** 이 모델로 다시 만든다. 생략하면 embed.ts 의 기본값. */
  model?: string;
  onProgress?: (p: ReembedProgress) => void;
};

/**
 * 모든 기억의 임베딩을 다시 만든다.
 *
 * 청크 단위로 읽고 → 임베딩하고 → 그 청크만 커밋한다. 중간에 끊겨도 이미 처리한
 * 청크는 남으므로 다시 돌리면 이어서가 아니라 처음부터 하지만 손실은 없다
 * (같은 내용을 다시 임베딩하는 비용만 든다).
 */
export async function reembedAll(
  options: ReembedOptions = {},
): Promise<{ updated: number; skipped: number }> {
  const chunkSize = options.chunkSize ?? 200;
  const pauseMs = options.pauseMs ?? 0;

  const rows = await db
    .select({ id: memories.id, content: memories.content })
    .from(memories)
    .orderBy(memories.createdAt);

  const total = rows.length;
  let updated = 0;
  let skipped = 0;

  for (let offset = 0; offset < total; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);

    // 내용이 빈 행은 임베딩할 수 없다. 건너뛰고 기존 벡터를 그대로 둔다 —
    // 지우면 검색 대상에서 사라지는데, 그건 재임베딩이 할 일이 아니다.
    const usable = chunk.filter((r) => r.content.trim().length > 0);
    skipped += chunk.length - usable.length;

    if (usable.length > 0) {
      const vectors = await embedMany(
        usable.map((r) => r.content),
        { inputType: "document", ...(options.model ? { model: options.model } : {}) },
      );

      // 한 청크를 한 트랜잭션으로. 벡터를 받아놓고 쓰다가 끊기는 구간을 줄인다.
      await db.transaction(async (tx) => {
        for (const [i, row] of usable.entries()) {
          const vector = vectors[i];
          if (!vector) throw new Error(`임베딩이 비었다: ${row.id}`);
          await tx
            .update(memories)
            .set({ embedding: vector })
            .where(sql`${memories.id} = ${row.id}`);
        }
      });
      updated += usable.length;
    }

    options.onProgress?.({ done: offset + chunk.length, total, skipped });

    const isLast = offset + chunkSize >= total;
    if (!isLast && pauseMs > 0) {
      await new Promise<void>((r) => setTimeout(r, pauseMs));
    }
  }

  return { updated, skipped };
}
