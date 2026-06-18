import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { askClaude } from "../claude/ask.js";
import { warmEnabled, runWarmTurn, WarmFallback, dropWarmSession } from "../claude/warm.js";
import { curateTurn } from "../claude/curator.js";
import { collectImagesFromDataUrls } from "../claude/images.js";
import type { AskResult, InputImage } from "../claude/types.js";
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
  normalizeSnapshotMessages,
  type ChatSnapshot,
} from "./chat-turns.js";
import { setupAbandonGuards } from "./chat-guards.js";
import { turnMeta, finalizeTurn, handleStreamError } from "./chat-finalize.js";

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

// 한 요청당 이미지 상한 — 토큰/메모리 과부하·악의적 페이로드 방지. images.ts 에서 개별
// 이미지 크기를 다시 거르지만, 여기서 먼저 끊어 디코드 비용 자체를 막는다.
const MAX_IMAGES_PER_REQUEST = 8;
const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;

// data URL 의 base64 페이로드만 보고 디코드 바이트 크기를 근사한다. 정확한 디코드 전에
// 합계를 가늠하기 위함(`= 패딩 2자 제외).
function approxDataUrlBytes(u: string): number {
  const i = u.indexOf(";base64,");
  if (i < 0) return u.length;
  const b64 = u.slice(i + ";base64,".length);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

// chat / chat-stream 공통 바디 파싱. text + 첨부 이미지(data URL) + resume(sessionId).
// 텍스트도 이미지도 없으면 400 을 쓰고 null 을 반환한다(이미지-only 는 허용).
async function parseChatRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<ChatRequest | null> {
  const body = await readJsonBody(req, res);
  if (!body) return null;
  const text = typeof body.text === "string" ? body.text.trim() : "";

  const imageUrls = Array.isArray(body.images)
    ? (body.images.filter((u) => typeof u === "string") as string[])
    : [];
  // 개수/총량 상한 — 초과 시 디코드도 하지 않고 즉시 400.
  if (imageUrls.length > MAX_IMAGES_PER_REQUEST) {
    sendJson(res, 400, {
      error: `too many images (max ${MAX_IMAGES_PER_REQUEST})`,
    });
    return null;
  }
  let total = 0;
  for (const u of imageUrls) total += approxDataUrlBytes(u);
  if (total > MAX_TOTAL_IMAGE_BYTES) {
    sendJson(res, 400, {
      error: `total image bytes too large (max ${MAX_TOTAL_IMAGE_BYTES})`,
    });
    return null;
  }
  const images = imageUrls.length > 0 ? await collectImagesFromDataUrls(imageUrls) : [];

  if (!text && images.length === 0) {
    sendJson(res, 400, { error: "text or image required" });
    return null;
  }
  const resume =
    typeof body.sessionId === "string" && body.sessionId ? body.sessionId : undefined;
  // 모델은 화이트리스트(config.selectableModels) 검증 — 임의 문자열 주입 차단.
  const model =
    typeof body.model === "string" && config.selectableModels.includes(body.model)
      ? body.model
      : undefined;
  const thinking = body.thinking === true;

  const conversationId =
    typeof body.conversationId === "string" && body.conversationId
      ? body.conversationId
      : undefined;
  const turnId =
    typeof body.turnId === "string" && body.turnId ? body.turnId : undefined;
  const snap =
    body.conversation && typeof body.conversation === "object"
      ? (body.conversation as Record<string, unknown>)
      : undefined;
  // 스냅샷 메시지는 클라가 보낸 임의 구조라 그대로 namory upsert 로 흘러가면 안 된다.
  // {id,role,text,createdAt} 만 통과시키고 잡 원소를 제거(저장 전 단계에서 한번).
  const snapshot: ChatSnapshot | undefined = snap
    ? {
        title: typeof snap.title === "string" ? snap.title : "",
        messages: normalizeSnapshotMessages(snap.messages),
        unread: typeof snap.unread === "number" ? snap.unread : 0,
        sessionId: typeof snap.sessionId === "string" ? snap.sessionId : null,
      }
    : undefined;

  return { text, images, resume, model, thinking, conversationId, turnId, snapshot };
}

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

// 스트리밍 콜백 묶음. 워밍/콜드 경로 양쪽에서 동일하게 쓴다(thinking 은 콜드 전용).
type StreamCallbacks = {
  onTextDelta: (delta: string) => void;
  onStatus: (toolName: string) => void;
  onToolComplete: (label: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

// 워밍/콜드 선택 — 워밍 가능하면 warm 시도, WarmFallback(스트리밍 시작 전 신호)이면
// 콜드로 같은 턴 재실행. 콜드 폴백은 사용자가 멈추지 않은 경우에만(abort 후엔 던진다).
// 워밍 경로는 중지(/api/chat/cancel → abort)에 대응해 워밍 세션을 폐기한다.
// 호출부(handleChatStream) 는 워밍/콜드 분기 자체를 모르게 한다.
async function runChatTurn(
  parsed: ChatRequest,
  callbacks: StreamCallbacks,
  abortController: AbortController,
): Promise<AskResult> {
  const askCold = (): Promise<AskResult> =>
    askClaude({
      prompt: parsed.text,
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
