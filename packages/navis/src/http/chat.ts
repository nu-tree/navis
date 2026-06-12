import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { askClaude } from "../claude/ask.js";
import { warmEnabled, runWarmTurn, WarmFallback, dropWarmSession } from "../claude/warm.js";
import { curateTurn } from "../claude/curator.js";
import { collectImagesFromDataUrls } from "../claude/images.js";
import type { AskResult, InputImage } from "../claude/types.js";
import {
  CORS_HEADERS,
  readBody,
  safeParse,
  requireAppAuth,
  sendJson,
} from "./respond.js";
import {
  registerTurn,
  clearTurn,
  cancelTurn,
  consumeCancelled,
  persistAndNotify,
  type ChatSnapshot,
} from "./chat-turns.js";

type ChatRequest = {
  text: string;
  images: InputImage[];
  resume: string | undefined;
  // 사용자가 고른 모델(클로드 데스크톱식). 화이트리스트에 있을 때만 채워지고,
  // 아니면 undefined → askClaude 가 config.model 로 폴백한다.
  model: string | undefined;
  // 확장 사고(adaptive thinking) opt-in. body 에 명시적으로 true 일 때만 켠다.
  // 기본 off — adaptive 라도 첫 토큰을 2~4초 늦추므로 응답성 우선.
  thinking: boolean;
  // 백그라운드 완주/푸시용(스트림 전용). conversationId+conversation 스냅샷이 있으면
  // 클라가 응답 전에 떠나도 서버가 응답을 영속 + 폰 푸시한다. turnId 로 명시적 중지.
  conversationId: string | undefined;
  turnId: string | undefined;
  snapshot: ChatSnapshot | undefined;
};

// chat / chat-stream 공통 바디 파싱. text + 첨부 이미지(data URL) + resume(sessionId).
// 텍스트도 이미지도 없으면 400 을 쓰고 null 을 반환한다(이미지-only 는 허용).
async function parseChatRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<ChatRequest | null> {
  const raw = await readBody(req);
  const body = safeParse(raw);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  const imageUrls = Array.isArray(body?.images)
    ? (body.images.filter((u) => typeof u === "string") as string[])
    : [];
  const images = imageUrls.length > 0 ? await collectImagesFromDataUrls(imageUrls) : [];

  if (!text && images.length === 0) {
    sendJson(res, 400, { error: "text or image required" });
    return null;
  }
  const resume =
    typeof body?.sessionId === "string" && body.sessionId ? body.sessionId : undefined;
  // 모델은 화이트리스트(config.selectableModels) 검증 — 임의 문자열 주입 차단.
  const model =
    typeof body?.model === "string" && config.selectableModels.includes(body.model)
      ? body.model
      : undefined;
  const thinking = body?.thinking === true;

  const conversationId =
    typeof body?.conversationId === "string" && body.conversationId
      ? body.conversationId
      : undefined;
  const turnId =
    typeof body?.turnId === "string" && body.turnId ? body.turnId : undefined;
  const snap =
    body?.conversation && typeof body.conversation === "object"
      ? (body.conversation as Record<string, unknown>)
      : undefined;
  const snapshot: ChatSnapshot | undefined = snap
    ? {
        title: typeof snap.title === "string" ? snap.title : "",
        messages: Array.isArray(snap.messages) ? snap.messages : [],
        unread: typeof snap.unread === "number" ? snap.unread : 0,
        sessionId: typeof snap.sessionId === "string" ? snap.sessionId : null,
      }
    : undefined;

  return { text, images, resume, model, thinking, conversationId, turnId, snapshot };
}

// 명시적 중지 — 진행 중인 챗 턴 생성을 실제로 끊는다(토큰 절약). 단순 연결 종료
// (폰 백그라운드)는 생성을 끊지 않으므로, 중지 버튼은 이 엔드포인트를 따로 부른다.
export async function handleChatCancel(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  const body = safeParse(await readBody(req));
  const turnId = typeof body?.turnId === "string" ? body.turnId : "";
  const ok = turnId ? cancelTurn(turnId) : false;
  sendJson(res, 200, { ok });
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

    const result = await askClaude(
      parsed.text,
      parsed.resume,
      parsed.images,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      parsed.model,
    );
    const contextFull = result.contextTokens >= config.contextTokenLimit;

    sendJson(res, 200, {
      text: result.text,
      sessionId: result.sessionId,
      contextFull,
      // 이 턴에 namory 에 기억을 저장했는지 → 앱이 💡 리액션 표시
      saved: result.saved,
    });

    curate(parsed.text, result.text);
  } catch (err) {
    console.error("[chat] 처리 실패:", err);
    if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
  }
}

// /api/chat 의 스트리밍 버전. 응답 토큰을 SSE 로 흘려보낸다:
//   event: delta     data: {"text":"..."}  ← 답변 토큰 조각 (여러 번)
//   event: thinking  data: {"text":"..."}  ← 생각 과정 조각 (adaptive — 있을 때만)
//   event: done      data: {"sessionId","contextFull","saved"}  ← 종료 + 메타
//   event: error     data: {"error"}        ← 실패
export async function handleChatStream(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  const parsed = await parseChatRequest(req, res);
  if (!parsed) return;

  // SSE 헤더. 프록시(Railway) 버퍼링 방지 위해 x-accel-buffering 도 끈다.
  res.writeHead(200, {
    ...CORS_HEADERS,
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  // 연결이 끊긴 뒤(클라가 떠남) 쓰면 EPIPE 가 나므로 항상 가드한다.
  const sse = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // 도구 호출이 길게 이어지는 동안 바이트가 안 흐르면 Railway 프록시·클라가 idle
  // 로 보고 끊어버린다. SSE 주석 핑을 응답이 완전히 끝날 때까지 흘려 연결을 유지.
  // 주석(`:`)은 SSE 파서가 무시한다. 첫 토큰 이후에도 도구 호출이 이어질 수 있어서
  // 첫 delta에 핑을 끄지 않고 finally 블록에서만 정리한다.
  res.write(": open\n\n");
  let heartbeat: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, 5_000);
  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  };

  // 연결 종료 != 중지. 폰을 잠그거나 앱을 나가면 연결이 끊기지만(clientGone) 생성은
  // 계속 돌려 완료 후 서버가 응답을 영속 + 폰 푸시한다. 실제 중지는 /api/chat/cancel
  // 이 turnId 로 이 컨트롤러를 abort 할 때만 일어난다(토큰 절약은 그 경로로 유지).
  const abortController = new AbortController();
  if (parsed.turnId) registerTurn(parsed.turnId, abortController);
  let clientGone = false;
  req.on("close", () => {
    stopHeartbeat();
    clientGone = true;
  });

  try {
    // 스트리밍 콜백 — 워밍/콜드 경로 공통.
    const onDelta = (delta: string) => sse("delta", { text: delta });
    const onStatus = (toolName: string) => sse("status", { tool: toolName });
    const onTool = (label: string) => sse("tool", { label });
    // 확장 사고는 opt-in — body.thinking:true 일 때만 델타를 흘려보낸다(콜드 경로 전용).
    const onThinking = parsed.thinking
      ? (delta: string) => sse("thinking", { text: delta })
      : undefined;

    // 워밍 경로 조건: 켜짐 + 대화 id 있음 + 이미지/확장사고 아님(이 둘은 턴마다 세션
    // 옵션이 달라 콜드로 처리). 워밍이 폴백을 던지면(스트리밍 시작 전) 콜드로 재시도.
    const canWarm =
      warmEnabled() && !!parsed.conversationId && parsed.images.length === 0 && !parsed.thinking;

    const askCold = (): Promise<AskResult> =>
      askClaude(
        parsed.text,
        parsed.resume,
        parsed.images,
        false,
        undefined,
        undefined,
        onDelta,
        onStatus,
        onTool,
        parsed.model,
        onThinking,
        abortController,
      );

    let result: AskResult;
    if (canWarm) {
      const convId = parsed.conversationId as string;
      // 중지(/api/chat/cancel → abort) 시 워밍 세션을 폐기해 SDK 생성을 끊는다.
      const onAbort = () => dropWarmSession(convId);
      abortController.signal.addEventListener("abort", onAbort);
      try {
        result = await runWarmTurn({
          conversationId: convId,
          prompt: parsed.text,
          model: parsed.model ?? config.model,
          resume: parsed.resume,
          callbacks: { onTextDelta: onDelta, onStatus, onToolComplete: onTool },
        });
      } catch (err) {
        // 스트리밍 시작 전 폴백 신호이고 사용자가 멈춘 게 아니면 콜드로 같은 턴 재실행.
        if (err instanceof WarmFallback && !abortController.signal.aborted) {
          result = await askCold();
        } else {
          throw err;
        }
      } finally {
        abortController.signal.removeEventListener("abort", onAbort);
      }
    } else {
      result = await askCold();
    }
    if (parsed.turnId) clearTurn(parsed.turnId);
    const contextFull = result.contextTokens >= config.contextTokenLimit;

    if (clientGone) {
      // 클라가 응답 전에 떠남 → 서버가 대신 대화에 답변을 써넣고(동기화로 복원) 폰 푸시.
      // 포그라운드(연결 유지)였다면 클라가 받은 응답을 스스로 동기화하므로 생략(중복 방지).
      // 단, 완료 직후 도착한 중지 신호가 있으면(consumeCancelled) 사용자가 멈춘 것이므로
      // 영속/푸시하지 않는다.
      const stopped = parsed.turnId ? consumeCancelled(parsed.turnId) : false;
      if (!stopped && parsed.conversationId && parsed.snapshot) {
        await persistAndNotify(parsed.conversationId, parsed.snapshot, {
          text: result.text,
          toolsUsed: result.toolsUsed,
          sessionId: result.sessionId,
        });
      }
    } else {
      // 권위 있는 최종 텍스트도 함께 보내 클라가 누적분을 보정하게 한다.
      sse("done", {
        text: result.text,
        sessionId: result.sessionId,
        contextFull,
        saved: result.saved,
        toolsUsed: result.toolsUsed,
        // 지연 계측(ms) — 앱/디버그에서 응답 속도 분해 확인용.
        timing: result.timing,
        // 이 턴에 실제로 사용된 모델 — 앱이 모델 선택이 반영됐는지 확인/표시.
        model: parsed.model ?? config.model,
      });
      if (!res.writableEnded) res.end();
    }

    curate(parsed.text, result.text);
  } catch (err) {
    if (parsed.turnId) clearTurn(parsed.turnId);
    // 명시적 중지(/api/chat/cancel → abort)로 query 가 끊긴 건 에러가 아니다 —
    // 영속/푸시 없이 조용히 종료(사용자가 의도적으로 멈춤).
    if (abortController.signal.aborted) {
      if (!res.writableEnded) res.end();
    } else {
      console.error("[chat/stream] 처리 실패:", err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "internal error" });
      } else {
        sse("error", { error: "internal error" });
        if (!res.writableEnded) res.end();
      }
    }
  } finally {
    stopHeartbeat();
  }
}
