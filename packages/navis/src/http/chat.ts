import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { askClaude } from "../claude/ask.js";
import { warmEnabled, runWarmTurn, WarmFallback, dropWarmSession } from "../claude/warm.js";
import { curateTurn } from "../claude/curator.js";
import { collectImagesFromDataUrls } from "../claude/images.js";
import type { AskResult, InputImage } from "../claude/types.js";
import {
  readBody,
  safeParse,
  requireAppAuth,
  sendJson,
  sendInternalError,
} from "./respond.js";
import { writeSseHead, sseEvent, startHeartbeat } from "./sse.js";
import {
  registerTurn,
  clearTurn,
  cancelTurn,
  consumeCancelled,
  markHandoff,
  consumeHandoff,
  hasHandoff,
  persistAndNotify,
  type ChatSnapshot,
} from "./chat-turns.js";

// 스냅샷 없는 요청(진단 curl·새로고침·레거시 클라)이 끊긴 뒤(clientGone) 이 시간이
// 지나면 "버려진 요청"으로 보고 생성을 끊어 자원을 회수한다. 진짜 앱 턴(turnId+대화+
// 스냅샷)은 백그라운드 완주 대상이라 이 유예의 적용을 받지 않는다(아래 backgroundable).
// 이 가드가 없으면 버려진 생성들이 단일 이벤트 루프를 점유해 새 요청의 첫 토큰을
// 수십 초 지연시킨다(누적→포화).
const ABANDON_GRACE_MS = 15_000;

// 한 챗 턴의 wall-clock 상한. 백그라운드 완주 턴은 연결 종료로 끊지 않으므로(위), 어떤
// 이유로든(모델 API 스톨 등) result 가 영영 안 오는 생성이 inflight 슬롯을 무한히
// 점유하지 않도록 모든 챗 스트림 턴에 두는 안전 backstop. 정상 답변은 도구 루프를
// 포함해도 여기 닿지 않게 넉넉히 잡는다(워밍 경로의 TURN_TIMEOUT_MS 와 동일 5분).
const MAX_TURN_MS = 5 * 60_000;

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
  const raw = await readBody(req, res);
  const body = safeParse(raw);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  const imageUrls = Array.isArray(body?.images)
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

// chat / chat-stream 공통 — 응답 메타(contextFull, 실제 사용 모델) 계산.
// contextFull 은 다음 턴에 세션 리셋 신호로 클라가 쓰고, model 은 앱이 모델 선택 반영
// 여부를 표시하는 데 쓴다. modelOverride 가 화이트리스트로 걸러진 값 또는 undefined
// 라는 전제 — undefined 면 askClaude 가 config.model 로 돈다.
function turnMeta(
  result: AskResult,
  modelOverride: string | undefined,
): { contextFull: boolean; model: string } {
  return {
    contextFull: result.contextTokens >= config.contextTokenLimit,
    model: modelOverride ?? config.model,
  };
}

// 명시적 중지 — 진행 중인 챗 턴 생성을 실제로 끊는다(토큰 절약). 단순 연결 종료
// (폰 백그라운드)는 생성을 끊지 않으므로, 중지 버튼은 이 엔드포인트를 따로 부른다.
// readBody 가 413(페이로드 초과)으로 reject 할 수 있어 try/catch 로 감싼다 — 라우터의
// void 호출에서 unhandledRejection 으로 흘러나가지 않게.
export async function handleChatCancel(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const body = safeParse(await readBody(req, res));
    const turnId = typeof body?.turnId === "string" ? body.turnId : "";
    const ok = turnId ? cancelTurn(turnId) : false;
    sendJson(res, 200, { ok });
  } catch (err) {
    sendInternalError(res, "[chat/cancel] 처리 실패:", err);
  }
}

// 핸드오프 — 앱이 백그라운드로 전환될 때 진행 중인 턴을 알린다. Railway 프록시 뒤에선
// 연결 종료(req 'close')가 서버까지 안 닿을 수 있어, 이 명시 신호로 "클라가 떠남"을
// 확실히 표시한다 → 완료 시 서버가 응답을 영속하고 폰으로 푸시한다. fire-and-forget.
// readBody/safeParse 경로의 예외(413 등)를 흘려보내지 않게 try/catch.
export async function handleChatHandoff(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const body = safeParse(await readBody(req, res));
    const turnId = typeof body?.turnId === "string" ? body.turnId : "";
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
//   event: done      data: {"sessionId","contextFull","saved"}  ← 종료 + 메타
//   event: error     data: {"error"}        ← 실패
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

  // 연결 종료 != 중지. 폰을 잠그거나 앱을 나가면 연결이 끊기지만(clientGone) 생성은
  // 계속 돌려 완료 후 서버가 응답을 영속 + 폰 푸시한다. 실제 중지는 /api/chat/cancel
  // 이 turnId 로 이 컨트롤러를 abort 할 때만 일어난다(토큰 절약은 그 경로로 유지).
  const abortController = new AbortController();
  if (parsed.turnId) registerTurn(parsed.turnId, abortController);

  // 진짜 앱 턴인가 — turnId + 대화 + 스냅샷이 모두 있으면, 사용자가 "보내고 폰을
  // 내려놔도 답이 끝나면 영속 + 푸시"되길 원하는 백그라운드 완주 대상 턴이다. 서버는
  // 이 정보를 요청 본문에서 이미 받으므로, 완주 여부 판단에 핸드오프 비콘이 꼭 필요하진
  // 않다. 이런 턴은 연결이 끊겨도(폰 백그라운드/잠금) 생성을 끊지 않는다:
  //  - iOS 는 백그라운드 전환 시 JS 를 즉시 정지시켜 비콘이 늦거나 유실될 수 있고,
  //  - 긴 답변은 생성에 15초 이상 걸려, 유예-후-abort 가 답을 다 만들기도 전에 죽인다.
  // 둘 다 "백그라운드로 보내면 답이 멈춘다"의 직접 원인이었다. 실제 중지는 오직
  // /api/chat/cancel(turnId) 만 — 토큰 절약 경로는 그대로 유지된다.
  const backgroundable = !!(parsed.turnId && parsed.conversationId && parsed.snapshot);
  let clientGone = false;
  let abandonTimer: ReturnType<typeof setTimeout> | undefined;
  // wall-clock 안전 backstop — 백그라운드 완주 턴은 연결 종료로 끊지 않으니, 생성이
  // 영영 안 끝나는 병적 케이스(모델 API 스톨 등)가 슬롯을 무한 점유하지 않게 상한을 둔다.
  const maxTurnTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
    if (!abortController.signal.aborted) abortController.abort();
  }, MAX_TURN_MS);
  req.on("close", () => {
    stopHeartbeat();
    clientGone = true;
    // 백그라운드 완주 대상 턴은 끊지 않는다 — 완료 시 clientGone(또는 핸드오프)으로
    // 영속 + 푸시 분기를 탄다(아래). 답을 잃지 않는 것이 최우선.
    if (backgroundable) return;
    // 스냅샷 없는 요청(진단 curl·새로고침·레거시 클라)만 "버려진 요청"으로 보고 유예
    // 후 회수한다 — 버려진 생성이 단일 이벤트 루프를 점유해 새 요청의 첫 토큰을 수십 초
    // 늦추는 누적→포화(death-spiral)를 막는 가드는 그대로 둔다.
    abandonTimer = setTimeout(() => {
      if (!(parsed.turnId && hasHandoff(parsed.turnId))) abortController.abort();
    }, ABANDON_GRACE_MS);
  });

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
    const { contextFull, model } = turnMeta(result, parsed.model);

    // 클라가 응답 전에 떠났는가? 두 신호를 함께 본다:
    //  - clientGone: req 'close'(연결 종료). 프록시 뒤에선 안 뜰 수 있어 단독으론 불충분.
    //  - handedOff: 앱이 AppState 'background' 에서 보낸 명시적 핸드오프(신뢰 가능한 신호).
    const handedOff = parsed.turnId ? consumeHandoff(parsed.turnId) : false;
    if (clientGone || handedOff) {
      // 클라가 응답 전에 떠남 → 서버가 대신 대화에 답변을 써넣고(동기화로 복원) 폰 푸시.
      // 포그라운드(연결 유지·핸드오프 없음)였다면 클라가 받은 응답을 스스로 동기화하므로
      // 생략(중복 방지). 단, 완료 직후 도착한 중지 신호가 있으면(consumeCancelled)
      // 사용자가 멈춘 것이므로 영속/푸시하지 않는다.
      const stopped = parsed.turnId ? consumeCancelled(parsed.turnId) : false;
      if (!stopped && parsed.conversationId && parsed.snapshot) {
        await persistAndNotify(parsed.conversationId, parsed.snapshot, {
          text: result.text,
          toolsUsed: result.toolsUsed,
          sessionId: result.sessionId,
        });
      }
      // 핸드오프인데 연결이 아직 열려 있을 수 있다(프록시가 끊김을 안 알림) → 정리.
      // done 은 보내지 않는다: 앱은 다음 동기화 pull 로 권위 응답을 받는다(중복 방지).
      if (!res.writableEnded) res.end();
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
        model,
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
    if (abandonTimer) clearTimeout(abandonTimer);
    clearTimeout(maxTurnTimer);
  }
}
