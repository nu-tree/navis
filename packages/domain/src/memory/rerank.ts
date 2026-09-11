// 불러오기 재정렬 — 유사도에 시간 가중치를 곱한다.
//
// ★ 왜 애플리케이션에서 하는가: 가중치를 SQL `ORDER BY` 안에서 곱하면
//   `memories_embedding_idx`(HNSW)를 타지 못하고 전체 스캔이 된다. DB 는 순수 벡터
//   근접 질의로 후보를 넉넉히 뽑고, 재정렬은 여기서 한다(R6).
//
// ★ 유사도의 **절대값에 의존하지 않는다.** 척도가 모델마다 다르다(embed.ts 주석 참조).
//   곱셈 형태라 척도가 바뀌어도 순위가 보존된다 — 임계값을 쓰면 그 성질이 깨진다.

import type { RecallHit } from "@navis/validation";

/**
 * 감쇠 반감기(일). 이 일수가 지나면 가중치가 절반이 된다.
 *
 * 30일로 둔 이유: 기억은 "며칠 전 결정"과 "몇 달 전 결정"을 가르면 되고, 그보다
 * 잘게 가를 필요가 없다. 너무 짧으면 오래된 사실이 영구히 밀려나고, 너무 길면
 * FR-017(대등하면 최근 우선)이 사실상 동작하지 않는다.
 */
export const HALF_LIFE_DAYS = 30;

/**
 * 감쇠가 내려갈 수 있는 하한.
 *
 * 0 으로 수렴시키면 오래된 기억이 유사도와 무관하게 사라진다. 제2의 뇌에서 그건
 * 기억을 잃는 것과 같다 — 1년 전 결정도 관련이 있으면 찾혀야 한다.
 */
const MIN_DECAY = 0.5;

const MS_PER_DAY = 86_400_000;

/** 나이(일) → 감쇠 계수. 반감기 지수 감쇠에 하한을 둔다. */
export const decay = (ageDays: number): number => {
  const raw = 0.5 ** (Math.max(ageDays, 0) / HALF_LIFE_DAYS);
  return MIN_DECAY + (1 - MIN_DECAY) * raw;
};

export type RerankOptions = {
  /** 기준 시각. 테스트에서 고정하기 위해 주입받는다. */
  now?: Date;
  /** 상위 몇 건만 남길지. 생략하면 전부. */
  limit?: number;
};

/**
 * 후보를 `유사도 × 감쇠` 로 재정렬한다.
 *
 * 반환되는 `score` 는 재정렬 점수다 — 원본 유사도가 아니다. 화면에 유사도를 보여줄
 * 일이 생기면 별 필드로 나눠야 한다(지금은 소비자가 없어 만들지 않는다).
 */
export const rerank = (
  hits: readonly RecallHit[],
  { now = new Date(), limit }: RerankOptions = {},
): RecallHit[] => {
  const nowMs = now.getTime();

  const scored = hits.map((hit) => {
    const ageDays = (nowMs - Date.parse(hit.memory.createdAt)) / MS_PER_DAY;
    // createdAt 이 파싱 불가하면 감쇠를 적용하지 않는다 — 날짜 하나가 깨졌다고
    // 그 기억을 순위 밖으로 밀어낼 이유는 없다.
    const factor = Number.isFinite(ageDays) ? decay(ageDays) : 1;
    return { ...hit, score: hit.score * factor };
  });

  // 점수 내림차순. 동점이면 최근 것이 앞에 온다(FR-017).
  const sorted = [...scored].sort(
    (a, b) =>
      b.score - a.score ||
      Date.parse(b.memory.createdAt) - Date.parse(a.memory.createdAt),
  );

  return limit === undefined ? sorted : sorted.slice(0, limit);
};
