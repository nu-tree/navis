// 역할: navis-app 채팅 HTTP 핸들러 조립부.
// 요청 파싱(chat-request.ts)·턴 실행(chat-run.ts)·완결 처리(chat-finalize.ts)·
// 가드(chat-guards.ts)를 묶어 4개 엔드포인트를 노출한다:
//   handleChat        — 비스트리밍 채팅
//   handleChatStream  — SSE 스트리밍 채팅
//   handleChatCancel  — 진행 중 턴 명시 중지
//   handleChatHandoff — 백그라운드 전환 신호
// 공개 export 는 router.ts 가 그대로 쓰므로 절대 바꾸지 않는다.

import type { IncomingMessage, ServerResponse } from "node:http";
import { askClaude } from "../claude/ask.js";
import { fullChatEnv } from "../claude/server-env.js";
import { curateTurn } from "../claude/curator.js";
import {
  readJsonBody,
  requireAppAuth,
  sendJson,
  sendInternalError,
} from "./respond.js";
import { writeSseHead, sseEvent, startHeartbeat } from "./sse.js";
import {
  registerTurn,
  clearTurn,
  cancelTurn,
  markHandoff,
} from "./chat-turns.js";
import { setupAbandonGuards } from "./chat-guards.js";
import { turnMeta, finalizeTurn, handleStreamError } from "./chat-finalize.js";
import { parseChatRequest } from "./chat-request.js";
import { runChatTurn, type StreamCallbacks } from "./chat-run.js";

// 명시적 중지 — 진행 중인 챗 턴 생성을 실제로 끊는다(토큰 절약). 단순 연결 종료
// (폰 백그라운드)는 생성을 끊지 않으므로, 중지 버튼은 이 엔드포인트를 따로 부른다.
// readJsonBody 가 413/파싱 실패 응답을 직접 처리한다.
export async function handleChatCancel(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const turnId = typeof body.turnId === "string" ? body.turnId : "";
    const ok = turnId ? cancelTurn(turnId) : false;
    sendJson(res, 200, { ok });
  } catch (err) {
    sendInternalError(res, "[chat/cancel] 처리 실패:", err);
  }
}

// 핸드오프 — 앱이 백그라운드로 전환될 때 진행 중인 턴을 알린다. Railway 프록시 뒤에선
// 연결 종료(req 'close')가 서버까지 안 닿을 수 있어, 이 명시 신호로 "클라가 떠남"을
// 확실히 표시한다 → 완료 시 서버가 응답을 영속하고 폰으로 푸시한다. fire-and-forget.
export async function handleChatHandoff(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const turnId = typeof body.turnId === "string" ? body.turnId : "";
    if (turnId) markHandoff(turnId);
    sendJson(res, 200, { ok: !!turnId });
  } catch (err) {
    sendInternalError(res, "[chat/handoff] 처리 실패:", err);
  }
}

// 사후 큐레이터(A) — 응답을 보낸 뒤 백그라운드로 한 번 더 평가해 저장 누락을 메운다.
// fire-and-forget — 실패는 무시.
function curate(text: string, assistantText: string): void {
  curateTurn({ userText: text, assistantText }).catch(() => {});
}

// navis-app(모바일/데스크톱) 채팅 엔드포인트. askClaude(두뇌)를 쓰되
// 인증은 APP_API_TOKEN Bearer 로 한다. 멀티턴은 클라가 보관한 sessionId 로 이어가고,
// 컨텍스트가 한도를 넘으면 contextFull:true 를 돌려 클라가 다음 턴부터 세션을 리셋한다.
export async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (!requireAppAuth(req, res)) return;
    const parsed = await parseChatRequest(req, res);
    if (!parsed) return;

    const result = await askClaude({
      prompt: parsed.text,
      env: fullChatEnv,
      resumeSessionId: parsed.resume,
      images: parsed.images,
      modelOverride: parsed.model,
    });
    const { contextFull } = turnMeta(result, parsed.model);

    sendJson(res, 200, {
      text: result.text,
      sessionId: result.sessionId,
      contextFull,
      // 이 턴에 namory 에 기억을 저장했는지 → 앱이 💡 리액션 표시
      saved: result.saved,
    });

    curate(parsed.text, result.text);
  } catch (err) {
    sendInternalError(res, "[chat] 처리 실패:", err);
  }
}

// /api/chat 의 스트리밍 버전. 응답 토큰을 SSE 로 흘려보낸다:
//   event: delta     data: {"text":"..."}  ← 답변 토큰 조각 (여러 번)
//   event: thinking  data: {"text":"..."}  ← 생각 과정 조각 (adaptive — 있을 때만)
//   event: done      data: {"sessionId","contextFull","saved"}  ← 정상 종료 + 메타
//   event: aborted   data: {"reason"}       ← 사용자/타임아웃 중지로 인한 종료 신호
//   event: error     data: {"error"}        ← 실패
//
// 연결 종료 != 중지. 폰을 잠그거나 앱을 나가면 연결이 끊기지만(clientGone) 생성은
// 계속 돌려 완료 후 서버가 응답을 영속 + 폰 푸시한다. 실제 중지는 /api/chat/cancel
// 이 turnId 로 이 컨트롤러를 abort 할 때만 일어난다(토큰 절약은 그 경로로 유지).
export async function handleChatStream(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  const parsed = await parseChatRequest(req, res);
  if (!parsed) return;

  writeSseHead(res);
  const sse = (event: string, data: unknown) => sseEvent(res, event, data);
  const stopHeartbeat = startHeartbeat(res);

  const abortController = new AbortController();
  if (parsed.turnId) registerTurn(parsed.turnId, abortController);

  const { state, cleanup } = setupAbandonGuards(
    req,
    {
      turnId: parsed.turnId,
      conversationId: parsed.conversationId,
      hasSnapshot: !!parsed.snapshot,
    },
    abortController,
    stopHeartbeat,
  );

  try {
    const callbacks: StreamCallbacks = {
      onTextDelta: (delta) => sse("delta", { text: delta }),
      onStatus: (toolName) => sse("status", { tool: toolName }),
      onToolComplete: (label) => sse("tool", { label }),
      // 확장 사고는 opt-in — body.thinking:true 일 때만 델타를 흘려보낸다(콜드 경로 전용).
      onThinkingDelta: parsed.thinking
        ? (delta) => sse("thinking", { text: delta })
        : undefined,
    };

    const result = await runChatTurn(parsed, callbacks, abortController);
    if (parsed.turnId) clearTurn(parsed.turnId);
    await finalizeTurn(
      result,
      {
        turnId: parsed.turnId,
        conversationId: parsed.conversationId,
        snapshot: parsed.snapshot,
        modelOverride: parsed.model,
      },
      res,
      sse,
      state,
    );
    curate(parsed.text, result.text);
  } catch (err) {
    if (parsed.turnId) clearTurn(parsed.turnId);
    handleStreamError(err, res, sse, abortController);
  } finally {
    stopHeartbeat();
    cleanup();
  }
}
