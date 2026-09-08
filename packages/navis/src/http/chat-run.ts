// 역할: 한 챗 스트림 턴의 실행 엔진.
//
// 예전에는 여기서 "워밍/콜드" 두 경로를 골랐다. 워밍 세션은 대화별로 query() 세션을
// streaming-input 모드로 살려둬 CLI 스폰+MCP 핸드셰이크(첫 토큰 ~1.6s 바닥)를 아끼는
// 최적화였는데, 그건 프로세스가 요청 사이에도 계속 살아 있어야 성립한다.
// 서버리스에는 그 전제가 없다 — 응답을 보내면 인스턴스가 얼려지고, 다음 요청은 다른
// 인스턴스로 갈 수 있어 세션 Map 이 비어 있다. 그래서 워밍 계층은 통째로 걷어냈다
// (원래도 NAVIS_WARM_SESSIONS=1 일 때만 켜지는 기본 비활성 경로였고, 실패 시 폴백
//  대상이 바로 이 콜드 경로였다).
//
// 콜드스타트 비용을 되찾는 건 다른 층에서 해야 한다: namory 가 in-process MCP 로
// 바뀌어 MCP 핸드셰이크 왕복이 이미 사라졌고, 대화 맥락은 resume 대신 namory 에
// 저장된 이력을 매 턴 재생해 잇는다.

import { askClaude } from "../claude/ask.js";
import { fullChatEnv } from "../claude/server-env.js";
import type { AskResult } from "../claude/types.js";
import type { ChatRequest } from "./chat-request.js";

// 스트리밍 콜백 묶음.
export type StreamCallbacks = {
  onTextDelta: (delta: string) => void;
  onStatus: (toolName: string) => void;
  onToolComplete: (label: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export async function runChatTurn(
  parsed: ChatRequest,
  callbacks: StreamCallbacks,
  abortController: AbortController,
): Promise<AskResult> {
  return askClaude({
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
}
