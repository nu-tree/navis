// 역할: 채팅 HTTP 핸들러 조립부.
// 요청 파싱(chat-request.ts)·턴 실행(chat-run.ts)·완결 처리(chat-finalize.ts)·
// 가드(chat-guards.ts)를 묶어 4개 엔드포인트를 노출한다:
//   handleChat        — 비스트리밍 채팅
//   handleChatStream  — SSE 스트리밍 채팅
//   handleChatCancel  — 진행 중 턴 명시 중지
//   handleChatHandoff — 백그라운드 전환 신호

import { askClaude } from "../claude/ask.js";
import { fullChatEnv } from "../claude/server-env.js";
import { curateTurn } from "../claude/curator.js";
import { checkAppAuth, internalError, json, readJsonBody } from "./respond.js";
import { createSseStream, type SseWriter } from "./sse.js";
import {
  cancelTurn,
  finishTurn,
  markHandoff,
  registerTurn,
  watchCancel,
} from "./chat-turns.js";
import { setupAbandonGuards } from "./chat-guards.js";
import { turnMeta, finalizeTurn, handleStreamError } from "./chat-finalize.js";
import { parseChatRequest, type ChatRequest } from "./chat-request.js";
import { runChatTurn, type StreamCallbacks } from "./chat-run.js";

// 명시적 중지 — 진행 중인 챗 턴 생성을 실제로 끊는다(토큰 절약). 단순 연결 종료
// (폰 백그라운드)는 생성을 끊지 않으므로, 중지 버튼은 이 엔드포인트를 따로 부른다.
export async function handleChatCancel(req: Request): Promise<Response> {
  const denied = checkAppAuth(req);
  if (denied) return denied;
  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const turnId = typeof parsed.body.turnId === "string" ? parsed.body.turnId : "";
    const ok = turnId ? await cancelTurn(turnId) : false;
    return json(200, { ok });
  } catch (err) {
    return internalError("[chat/cancel] 처리 실패:", err);
  }
}

// 핸드오프 — 앱이 백그라운드로 전환될 때 진행 중인 턴을 알린다. 프록시 뒤에선
// 연결 종료가 서버까지 안 닿을 수 있어, 이 명시 신호로 "클라가 떠남"을 확실히
// 표시한다 → 완료 시 서버가 응답을 영속하고 폰으로 푸시한다.
export async function handleChatHandoff(req: Request): Promise<Response> {
  const denied = checkAppAuth(req);
  if (denied) return denied;
  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const turnId = typeof parsed.body.turnId === "string" ? parsed.body.turnId : "";
    if (turnId) await markHandoff(turnId);
    return json(200, { ok: !!turnId });
  } catch (err) {
    return internalError("[chat/handoff] 처리 실패:", err);
  }
}

// 사후 큐레이터 — 응답을 보낸 뒤 한 번 더 평가해 저장 누락을 메운다.
//
// 서버리스 주의: 응답을 돌려준 뒤 인스턴스가 얼려지면 이 작업은 완료되지 않을 수 있다.
// 비스트리밍(handleChat)에서는 그래서 await 한다 — fire-and-forget 하면 대개 유실된다.
// 스트리밍에서는 스트림이 아직 열려 있는 동안(응답 종료 직전) 돌리므로 완주한다.
async function curate(text: string, assistantText: string): Promise<void> {
  try {
    await curateTurn({ userText: text, assistantText });
  } catch {
    /* 큐레이터 실패는 사용자 응답에 영향을 주지 않는다 */
  }
}

// 비스트리밍 채팅. 멀티턴은 클라가 보관한 sessionId 로 이어가고, 컨텍스트가 한도를
// 넘으면 contextFull:true 를 돌려 클라가 다음 턴부터 세션을 리셋한다.
export async function handleChat(req: Request): Promise<Response> {
  const denied = checkAppAuth(req);
  if (denied) return denied;
  try {
    const parsed = await parseChatRequest(req);
    if (!parsed.ok) return parsed.response;
    const p = parsed.value;

    const result = await askClaude({
      prompt: p.text,
      env: fullChatEnv,
      resumeSessionId: p.resume,
      images: p.images,
      modelOverride: p.model,
    });
    const { contextFull } = turnMeta(result, p.model);

    // 큐레이터를 응답 전에 마친다 — 응답 후에는 인스턴스가 얼려져 못 돈다.
    await curate(p.text, result.text);

    return json(200, {
      text: result.text,
      sessionId: result.sessionId,
      contextFull,
      // 이 턴에 namory 에 기억을 저장했는지 → 앱이 💡 리액션 표시
      saved: result.saved,
    });
  } catch (err) {
    return internalError("[chat] 처리 실패:", err);
  }
}

// /api/chat 의 스트리밍 버전. 응답 토큰을 SSE 로 흘려보낸다:
//   event: delta     data: {"text":"..."}  ← 답변 토큰 조각 (여러 번)
//   event: thinking  data: {"text":"..."}  ← 생각 과정 조각 (adaptive — 있을 때만)
//   event: status    data: {"tool":"..."}  ← 도구 사용 진행 상태
//   event: tool      data: {"label":"..."} ← 도구 사용 한 줄
//   event: done      data: {...}           ← 정상 종료 + 메타
//   event: aborted   data: {"reason"}      ← 사용자/타임아웃 중지로 인한 종료 신호
//   event: error     data: {"error"}       ← 실패
//
// Next.js Route Handler 는 Response 를 돌려주는 모델이라, 스트림 Response 를 즉시
// 반환하고 실제 턴은 백그라운드에서 진행시킨다(runStream). 스트림이 열려 있는 동안
// 인스턴스는 깨어 있으므로 그 안의 타이머·비동기 작업은 정상 동작한다.
//
// 연결 종료 != 중지. 폰을 잠그거나 앱을 나가면 연결이 끊기지만 생성은 계속 돌려
// 완료 후 서버가 응답을 영속 + 폰 푸시한다. 실제 중지는 /api/chat/cancel 이
// turnId 로 중지 신호를 남길 때만 일어난다.
export async function handleChatStream(req: Request): Promise<Response> {
  const denied = checkAppAuth(req);
  if (denied) return denied;
  const parsed = await parseChatRequest(req);
  if (!parsed.ok) return parsed.response;

  const { response, writer } = createSseStream();
  // 백그라운드 진행 — await 하지 않는다(스트림 Response 를 먼저 돌려줘야 한다).
  void runStream(parsed.value, writer, req.signal);
  return response;
}

async function runStream(
  p: ChatRequest,
  writer: SseWriter,
  reqSignal: AbortSignal,
): Promise<void> {
  const abortController = new AbortController();
  if (p.turnId) registerTurn(p.turnId, abortController);

  // 다른 인스턴스에서 온 중지 신호를 감시(DB 폴링) — 서버리스에서 /api/chat/cancel 은
  // 보통 다른 인스턴스로 가므로, 그쪽의 AbortController 로는 이 생성을 끊을 수 없다.
  const stopWatch = p.turnId ? watchCancel(p.turnId, abortController) : () => undefined;

  const { state, cleanup } = setupAbandonGuards(
    reqSignal,
    {
      turnId: p.turnId,
      conversationId: p.conversationId,
      hasSnapshot: !!p.snapshot,
    },
    abortController,
    // 클라가 떠나면 스트림 쓰기를 멈춘다(하트비트 포함) — 생성은 계속 돈다.
    () => writer.close(),
  );

  try {
    const callbacks: StreamCallbacks = {
      onTextDelta: (delta) => writer.send("delta", { text: delta }),
      onStatus: (toolName) => writer.send("status", { tool: toolName }),
      onToolComplete: (label) => writer.send("tool", { label }),
      // 확장 사고는 opt-in — body.thinking:true 일 때만 델타를 흘려보낸다.
      onThinkingDelta: p.thinking
        ? (delta) => writer.send("thinking", { text: delta })
        : undefined,
    };

    const result = await runChatTurn(p, callbacks, abortController);
    await finalizeTurn(
      result,
      {
        turnId: p.turnId,
        conversationId: p.conversationId,
        snapshot: p.snapshot,
        modelOverride: p.model,
      },
      writer,
      state,
    );
    // 스트림을 닫은 뒤지만 아직 이 함수가 도는 동안은 인스턴스가 살아 있다.
    await curate(p.text, result.text);
  } catch (err) {
    handleStreamError(err, writer, abortController);
  } finally {
    stopWatch();
    cleanup();
    if (p.turnId) await finishTurn(p.turnId);
  }
}
