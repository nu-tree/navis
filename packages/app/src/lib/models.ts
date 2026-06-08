// 앱 채팅에서 고를 수 있는 모델(클로드 데스크톱식 모델 선택).
// value 는 백엔드 config.selectableModels 와 정확히 일치해야 한다 — 서버가 이 목록으로
// 검증해 일치하지 않는 값은 무시하고 기본 모델(Opus 4.8)로 폴백한다.
export type ChatModel = {
  value: string;
  label: string;
  hint: string;
};

export const CHAT_MODELS: ChatModel[] = [
  { value: 'claude-opus-4-8', label: 'Opus 4.8', hint: '최고 성능 · 기본' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', hint: '빠르고 균형 잡힘' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', hint: '가장 빠르고 가벼움' },
];

// 미선택 시 기본값 = 목록 첫 항목(서버 config.model 과 동일한 Opus 4.8).
export const DEFAULT_MODEL = CHAT_MODELS[0].value;

// 저장된 model 값에 해당하는 짧은 라벨(픽커 칩 표시용). 모르는 값이면 기본 라벨.
export const modelLabel = (value: string): string =>
  CHAT_MODELS.find((m) => m.value === value)?.label ?? CHAT_MODELS[0].label;
