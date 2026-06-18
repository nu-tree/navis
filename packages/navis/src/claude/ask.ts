// ── claude/ask 배럴 ───────────────────────────────────────────────────────────
// 역할: askClaude 핵심과 턴 처리 로직을 책임별 모듈(ask/*)로 분리한 뒤, 외부 import
// (../claude/ask.js, ./ask.js)를 한 줄도 바꾸지 않도록 동일한 공개 export 를 그대로
// 재export 하는 얇은 배럴. 실제 구현은 ask/ 하위 모듈을 보라:
//   - ask/message-processing.ts: 턴 누적 상태·SDK 메시지 처리기·ResultFailureError
//   - ask/prompt-input.ts: 프롬프트 입력 조립(너지·history·이미지)
//   - ask/ask-claude.ts: askClaude 오케스트레이션

export {
  ResultFailureError,
  newTurnAccumulator,
  iterToolUses,
  processChatMessage,
  type TurnAccumulator,
  type TurnCallbacks,
} from "./ask/message-processing.js";

export { buildPromptInput } from "./ask/prompt-input.js";

export { askClaude } from "./ask/ask-claude.js";
