import { CORS_HEADERS } from "./respond.js";

// ── SSE (Web 표준 ReadableStream) ────────────────────────────────────────────
// 예전에는 Node ServerResponse 에 직접 write 했다. Next.js Route Handler 는 Response
// 를 돌려주는 모델이라, 스트림을 만들고 그 안으로 이벤트를 밀어넣는 형태로 바꿨다.
//
// writableEnded 검사 대신 자체 closed 플래그를 본다 — 닫힌 컨트롤러에 enqueue 하면
// 예외가 나므로, 클라가 떠난 뒤의 쓰기를 조용히 무시해야 한다(백그라운드 완주 턴은
// 클라가 끊긴 뒤에도 생성이 계속 돌고 콜백이 계속 불린다).

// 도구 호출이 길게 이어지는 동안 바이트가 안 흐르면 프록시·클라가 idle 로 보고 끊는다.
// 주기적인 SSE 주석 핑으로 연결을 유지(주석 `:` 은 SSE 파서가 무시).
const HEARTBEAT_MS = 5_000;

export type SseWriter = {
  // 이벤트 1건 전송. 스트림이 닫혀 있으면 조용히 무시.
  send: (event: string, data: unknown) => void;
  // 스트림 종료(멱등).
  close: () => void;
  // 클라가 떠났거나 이미 닫혔는지.
  isClosed: () => boolean;
};

export function createSseStream(): { response: Response; writer: SseWriter } {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const push = (chunk: string): void => {
    if (closed || !controller) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      // 컨트롤러가 이미 닫힘(클라가 떠남) — 이후 쓰기를 멈춘다.
      closed = true;
    }
  };

  const stop = (): void => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      push(": open\n\n");
      heartbeat = setInterval(() => push(": ping\n\n"), HEARTBEAT_MS);
    },
    // 클라가 연결을 끊으면 런타임이 호출한다.
    cancel() {
      closed = true;
      stop();
    },
  });

  const writer: SseWriter = {
    send: (event, data) => push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    close: () => {
      if (closed) return;
      closed = true;
      stop();
      try {
        controller?.close();
      } catch {
        /* 이미 닫힘 */
      }
    },
    isClosed: () => closed,
  };

  const response = new Response(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // 프록시 버퍼링 방지.
      "x-accel-buffering": "no",
    },
  });

  return { response, writer };
}
