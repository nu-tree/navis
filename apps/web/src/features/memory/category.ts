import type { Category } from "@navis/validation";

/** 분류 표시 이름. 값의 집합은 @navis/validation 의 CATEGORIES 가 단일 출처다. */
export const CATEGORY_LABELS: Record<Category, string> = {
  decision: "결정",
  learning: "배움",
  idea: "아이디어",
  feeling: "감정",
  people: "사람",
  todo: "할 일",
};

/**
 * 분류 색 — 점 · 막대에 쓴다. 포인트 색(primary)과 겹치지 않게 고르고, 색만으로 구분하지 않도록
 * 언제나 옆에 이름(범례)을 둔다. 분류 없는 기억은 회색.
 */
export const CATEGORY_COLORS: Record<Category | "none", string> = {
  decision: "#f2b65a",
  learning: "#7c9cff",
  idea: "#e08fd0",
  feeling: "#ff8a80",
  people: "#5fd0b0",
  todo: "#e9e9ec",
  none: "#55555c",
};
