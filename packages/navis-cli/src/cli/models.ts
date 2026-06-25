import { config } from "navis/config.js";

// 모델 id → 사용자에게 보여줄 라벨. id 는 config.selectableModels(서버와 공유하는
// 화이트리스트)와 일치한다 — 목록은 config 한 곳에서만 늘린다.
const LABELS: Record<string, string> = {
  "claude-opus-4-8": "Opus 4.8 · 최고 품질",
  "claude-sonnet-4-6": "Sonnet 4.6 · 균형",
  "claude-haiku-4-5-20251001": "Haiku 4.5 · 빠름",
};

export type ModelOption = { id: string; label: string };

export const MODEL_OPTIONS: ModelOption[] = config.selectableModels.map((id) => ({
  id,
  label: LABELS[id] ?? id,
}));

export function modelLabel(id: string): string {
  return LABELS[id] ?? id;
}

// "/model sonnet" 같은 별칭/부분일치 → 정식 옵션. 못 찾거나 '모호'하면 undefined.
// 정확한 id 면 바로 채택. 아니면 id·라벨 부분일치 후보를 모아 '유일할 때만' 채택한다 —
// "claude"/"4" 처럼 여러 모델에 걸리는 질의는 silent 오선택 대신 미해석으로 돌려보낸다
// (호출부가 '알 수 없는 모델' 안내 + 전체 목록 표시).
export function resolveModel(query: string): ModelOption | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const exact = MODEL_OPTIONS.find((m) => m.id.toLowerCase() === q);
  if (exact) return exact;
  const matches = MODEL_OPTIONS.filter(
    (m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
