import type { ServerResponse } from "node:http";
import { CORS_HEADERS } from "./respond.js";

// SSE 응답 공통 유틸 — 헤더 셋업·이벤트 쓰기(가드)·하트비트.
// 분리 이유: chat-stream 외에도 동일 패턴이 늘어날 수 있고, handleChatStream 본문이
// 흐름만 읽히도록 가독성을 높인다.

// 도구 호출이 길게 이어지는 동안 바이트가 안 흐르면 Railway 프록시·클라가 idle 로 보고
// 끊어버린다. 주기적인 SSE 주석 핑으로 연결을 유지(주석 `:` 은 SSE 파서가 무시).
const HEARTBEAT_MS = 5_000;

// SSE 헤더 + 초기 `: open` 주석을 한 번에 내보낸다.
// 프록시(Railway) 버퍼링 방지 위해 x-accel-buffering 도 끈다.
export function writeSseHead(res: ServerResponse): void {
  res.writeHead(200, {
    ...CORS_HEADERS,
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(": open\n\n");
}

// 연결이 끊긴 뒤(클라가 떠남) 쓰면 EPIPE 가 나므로 항상 writableEnded 를 본다.
export function sseEvent(res: ServerResponse, event: string, data: unknown): void {
  if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// 응답이 완전히 끝날 때까지 핑을 흘린다. 반환값을 호출해 정리(finally 에서 1회).
export function startHeartbeat(res: ServerResponse): () => void {
  let timer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, HEARTBEAT_MS);
  return () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
