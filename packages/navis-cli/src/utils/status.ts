// 도구 진행 상태(askClaude onStatus)를 사람이 읽을 라벨로. '__thinking__'/'__answering__'
// 은 의사 상태이고, 그 외엔 도구 진행 라벨이 그대로 들어온다.
export function statusLabel(s: string): string {
  if (s === "__thinking__") return "생각 중...";
  if (s === "__answering__") return "답변 작성 중...";
  return s;
}
