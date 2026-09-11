// T037 — 재정렬은 순수 함수다. FR-017(대등하면 최근 우선)의 경계를 고정한다.
import { describe, expect, it } from "vitest";
import type { RecallHit } from "@navis/validation";
import { HALF_LIFE_DAYS, decay, rerank } from "./rerank";

const NOW = new Date("2026-09-11T00:00:00.000Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const hit = (id: string, score: number, ageDays: number): RecallHit => ({
  score,
  memory: {
    id,
    content: `기억 ${id}`,
    category: null,
    project: null,
    tags: [],
    done: null,
    createdAt: daysAgo(ageDays),
  },
});

describe("decay()", () => {
  it("오늘 기억은 감쇠하지 않는다", () => {
    expect(decay(0)).toBe(1);
  });

  it("반감기에서 원래 감쇠분의 절반", () => {
    // 하한 0.5 + (1-0.5)*0.5 = 0.75
    expect(decay(HALF_LIFE_DAYS)).toBeCloseTo(0.75, 5);
  });

  it("단조 감소한다", () => {
    const xs = [0, 10, 30, 90, 365, 3650].map(decay);
    expect(xs).toEqual([...xs].sort((a, b) => b - a));
  });

  // 0 으로 수렴시키면 오래된 기억이 유사도와 무관하게 사라진다.
  it("하한 아래로 내려가지 않는다 — 오래된 기억도 찾혀야 한다", () => {
    expect(decay(100_000)).toBeGreaterThanOrEqual(0.5);
  });

  it("음수 나이(시계 왜곡)는 오늘로 취급한다", () => {
    expect(decay(-5)).toBe(1);
  });
});

describe("rerank()", () => {
  // ── FR-017 의 핵심 ────────────────────────────────────────────────
  it("유사도가 같으면 최근 기억이 앞에 온다", () => {
    const out = rerank([hit("old", 0.5, 365), hit("new", 0.5, 1)], { now: NOW });
    expect(out.map((h) => h.memory.id)).toEqual(["new", "old"]);
  });

  it("유사도 차이가 크면 시간이 뒤집지 못한다", () => {
    // 0.9 × 0.5(최저 감쇠) = 0.45 > 0.4 × 1 = 0.4
    const out = rerank([hit("relevant-old", 0.9, 3650), hit("vague-new", 0.4, 0)], {
      now: NOW,
    });
    expect(out[0]?.memory.id).toBe("relevant-old");
  });

  it("유사도가 비슷하면 시간이 순위를 가른다", () => {
    const out = rerank([hit("slightly-better-old", 0.52, 365), hit("new", 0.5, 0)], {
      now: NOW,
    });
    expect(out[0]?.memory.id).toBe("new");
  });
  // ──────────────────────────────────────────────────────────────────

  it("score 를 재정렬 점수로 바꿔 돌려준다", () => {
    const [only] = rerank([hit("a", 0.8, 0)], { now: NOW });
    expect(only?.score).toBeCloseTo(0.8, 5);
    const [old] = rerank([hit("a", 0.8, HALF_LIFE_DAYS)], { now: NOW });
    expect(old?.score).toBeCloseTo(0.8 * 0.75, 5);
  });

  it("limit 으로 상위만 남긴다", () => {
    const out = rerank(
      [hit("a", 0.9, 0), hit("b", 0.8, 0), hit("c", 0.7, 0)],
      { now: NOW, limit: 2 },
    );
    expect(out.map((h) => h.memory.id)).toEqual(["a", "b"]);
  });

  it("빈 배열과 단일 원소", () => {
    expect(rerank([], { now: NOW })).toEqual([]);
    expect(rerank([hit("a", 0.5, 0)], { now: NOW })).toHaveLength(1);
  });

  it("입력을 변경하지 않는다 — 순수 함수", () => {
    const input = [hit("a", 0.5, 0), hit("b", 0.9, 0)];
    const snapshot = JSON.parse(JSON.stringify(input)) as RecallHit[];
    rerank(input, { now: NOW });
    expect(input).toEqual(snapshot);
  });

  // 날짜 하나가 깨졌다고 그 기억을 순위 밖으로 밀어낼 이유는 없다.
  it("createdAt 이 깨져 있으면 감쇠 없이 통과시킨다", () => {
    const broken = hit("broken", 0.6, 0);
    broken.memory.createdAt = "not-a-date";
    const out = rerank([broken, hit("normal", 0.5, 0)], { now: NOW });
    expect(out[0]?.memory.id).toBe("broken");
    expect(out[0]?.score).toBeCloseTo(0.6, 5);
  });
});
