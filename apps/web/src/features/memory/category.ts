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
