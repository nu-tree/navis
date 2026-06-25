// 역할: 한 챗 스트림 턴의 실행 엔진 — 워밍/콜드 경로 선택.
// 워밍 가능하면 warm 시도, WarmFallback(스트리밍 시작 전 신호)이면 콜드로 같은 턴을
// 재실행한다. 호출부(handleChatStream)는 워밍/콜드 분기를 모르게 한다.
// 순수 추출 — 동작/시그니처는 chat.ts 원본과 동일.

import { config } from "../config.js";
import { askClaude } from "../claude/ask.js";
import { fullChatEnv } from "../claude/server-env.js";
import { warmEnabled, runWarmTurn, WarmFallback, dropWarmSession } from "../claude/warm.js";
import type { AskResult } from "../claude/types.js";
import type { ChatRequest } from "./chat-request.js";

// 스트리밍 콜백 묶음. 워밍/콜드 경로 양쪽에서 동일하게 쓴다(thinking 은 콜드 전용).
export type StreamCallbacks = {
  onTextDelta: (delta: string) => void;
  onStatus: (toolName: string) => void;
  onToolComplete: (label: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

// 워밍/콜드 선택 — 워밍 가능하면 warm 시도, WarmFallback(스트리밍 시작 전 신호)이면
// 콜드로 같은 턴 재실행. 콜드 폴백은 사용자가 멈추지 않은 경우에만(abort 후엔 던진다).
// 워밍 경로는 중지(/api/chat/cancel → abort)에 대응해 워밍 세션을 폐기한다.
// 호출부(handleChatStream) 는 워밍/콜드 분기 자체를 모르게 한다.
export async function runChatTurn(
  parsed: ChatRequest,
  callbacks: StreamCallbacks,
  abortController: AbortController,
): Promise<AskResult> {
  const askCold = (): Promise<AskResult> =>
    askClaude({
      prompt: parsed.text,
      env: fullChatEnv,
      resumeSessionId: parsed.resume,
      images: parsed.images,
      onTextDelta: callbacks.onTextDelta,
      onStatus: callbacks.onStatus,
      onToolComplete: callbacks.onToolComplete,
      modelOverride: parsed.model,
      onThinkingDelta: callbacks.onThinkingDelta,
      abortController,
    });

  // 워밍 경로 조건: 켜짐 + 대화 id 있음 + 이미지/확장사고 아님(이 둘은 턴마다 세션
  // 옵션이 달라 콜드로 처리). 워밍이 폴백을 던지면(스트리밍 시작 전) 콜드로 재시도.
  const canWarm =
    warmEnabled() && !!parsed.conversationId && parsed.images.length === 0 && !parsed.thinking;
  if (!canWarm) return askCold();

  const convId = parsed.conversationId as string;
  // 중지(/api/chat/cancel → abort) 시 워밍 세션을 폐기해 SDK 생성을 끊는다.
  const onAbort = () => dropWarmSession(convId);
  abortController.signal.addEventListener("abort", onAbort);
  try {
    return await runWarmTurn({
      conversationId: convId,
      prompt: parsed.text,
      model: parsed.model ?? config.model,
      resume: parsed.resume,
      callbacks: {
        onTextDelta: callbacks.onTextDelta,
        onStatus: callbacks.onStatus,
        onToolComplete: callbacks.onToolComplete,
      },
    });
  } catch (err) {
    // 스트리밍 시작 전 폴백 신호이고 사용자가 멈춘 게 아니면 콜드로 같은 턴 재실행.
    if (err instanceof WarmFallback && !abortController.signal.aborted) {
      return askCold();
    }
    throw err;
  } finally {
    abortController.signal.removeEventListener("abort", onAbort);
  }
}
