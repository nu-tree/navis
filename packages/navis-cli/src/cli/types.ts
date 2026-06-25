// CLI 대화 한 줄(턴)의 모양. Static 리스트에 쌓여 화면에 순서대로 렌더된다.
export type TurnInput =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; saved: boolean }
  | { kind: "note"; text: string }
  | { kind: "error"; text: string };

export type Turn = TurnInput & { id: number };
