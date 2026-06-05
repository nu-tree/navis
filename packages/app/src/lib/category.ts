// 기억 분류(category) 라벨 — 칩 필터·카드 뱃지·편집 시트에서 공용으로 쓴다.
export type CategoryOption = { label: string; value: string };

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { label: '결정', value: 'decision' },
  { label: '배움', value: 'learning' },
  { label: '아이디어', value: 'idea' },
  { label: '감정', value: 'feeling' },
  { label: '사람', value: 'people' },
  { label: '할 일', value: 'todo' },
];

const LABEL_BY_VALUE = new Map(CATEGORY_OPTIONS.map((o) => [o.value, o.label]));

// 알려진 분류면 한글 라벨, 아니면 원래 값 그대로(임의 태그 대응).
export function categoryLabel(value: string): string {
  return LABEL_BY_VALUE.get(value) ?? value;
}
