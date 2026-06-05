import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { askClaude } from "../claude/ask.js";
import { curateTurn } from "../claude/curator.js";
import { collectImagesFromDataUrls } from "../claude/images.js";
import type { InputImage } from "../claude/types.js";
import {
  CORS_HEADERS,
  readBody,
  safeParse,
  requireAppAuth,
  sendJson,
} from "./respond.js";

type ChatRequest = { text: string; images: InputImage[]; resume: string | undefined };

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
  return { text, images, resume };
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

    const result = await askClaude(parsed.text, parsed.resume, parsed.images);
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
//   event: delta  data: {"text":"..."}   ← 토큰 조각 (여러 번)
//   event: done   data: {"sessionId","contextFull","saved"}  ← 종료 + 메타
//   event: error  data: {"error"}         ← 실패
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

  const sse = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // 첫 토큰까지 askClaude(에이전트 사고·도구 호출)가 수십 초 걸릴 수 있다. 그 사이
  // 바이트가 한 번도 안 흐르면 Railway 엣지·클라가 idle 연결로 보고 끊어버려 앱에
  // "나비스 서버에 연결하지 못했어요"로 뜬다(잦은 실패의 실제 원인). 즉시 한 번 +
  // 주기적으로 SSE 주석 핑을 흘려 연결을 살려둔다. 주석(`:`)은 클라 파서가 무시한다.
  res.write(": open\n\n");
  let heartbeat: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    res.write(": ping\n\n");
  }, 15_000);
  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  };
  // 클라가 먼저 끊으면 핑도 멈춘다(죽은 소켓에 write 방지).
  req.on("close", stopHeartbeat);

  try {
    const result = await askClaude(
      parsed.text,
      parsed.resume,
      parsed.images,
      false,
      undefined,
      undefined,
      (delta) => {
        stopHeartbeat(); // 실제 토큰이 흐르기 시작하면 핑 불필요.
        sse("delta", { text: delta });
      },
    );
    const contextFull = result.contextTokens >= config.contextTokenLimit;
    // 권위 있는 최종 텍스트도 함께 보내 클라가 누적분을 보정하게 한다.
    sse("done", {
      text: result.text,
      sessionId: result.sessionId,
      contextFull,
      saved: result.saved,
    });
    res.end();

    curate(parsed.text, result.text);
  } catch (err) {
    console.error("[chat/stream] 처리 실패:", err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "internal error" });
    } else {
      sse("error", { error: "internal error" });
      res.end();
    }
  } finally {
    stopHeartbeat();
  }
}
