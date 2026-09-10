import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { chat } from "@navis/domain";
import {
  cancelRequestSchema,
  chatRequestSchema,
  type ChatEvent,
} from "@navis/validation";

// 진행 중인 턴. 상주 서버라 프로세스 로컬 Map 으로 충분하다 — 중지가 DB 신호
// 없이 즉시 동작한다.
const inFlight = new Map<string, AbortController>();

// conversationId → 에이전트 세션 id. 방마다 맥락을 분리한다.
// TODO: conversation 모듈이 들어오면 conversations.sessionId 로 옮긴다.
//       지금은 대화방 저장이 없어 프로세스가 들고 있는다(재시작하면 맥락이 끊긴다).
const sessions = new Map<string, string>();

export const chatRoute = new Hono()
  .post("/", async (c) => {
    const parsed = chatRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    }
    const req = parsed.data;

    return streamSSE(c, async (stream) => {
      // writeSSE 를 여러 콜백에서 await 없이 부르면 프레임이 섞인다.
      // 프라미스 체인으로 직렬화한다.
      let queue = Promise.resolve();
      const send = (event: ChatEvent) => {
        queue = queue.then(() => {
          if (stream.aborted || stream.closed) return;
          return stream.writeSSE({ data: JSON.stringify(event) });
        });
        return queue;
      };

      const abortController = new AbortController();
      inFlight.set(req.turnId, abortController);

      try {
        const result = await chat.runTurn(
          {
            prompt: req.text,
            resumeSessionId: sessions.get(req.conversationId) ?? null,
            model: req.model,
            abortController,
          },
          {
            onDelta: (text) => void send({ type: "delta", text }),
            onThinking: (text) => void send({ type: "thinking", text }),
            onStatus: (tool) => void send({ type: "status", tool }),
          },
        );

        if (result.sessionId) sessions.set(req.conversationId, result.sessionId);

        await send({
          type: "done",
          message: {
            id: randomUUID(),
            role: "assistant",
            text: result.text,
            createdAt: new Date().toISOString(),
            ...(result.toolsUsed.length ? { toolsUsed: result.toolsUsed } : {}),
          },
          sessionId: result.sessionId,
          // TODO: 기억 MCP 가 붙으면 이 턴에 save 를 불렀는지로 채운다.
          saved: false,
        });
      } catch (err) {
        if (abortController.signal.aborted) {
          await send({ type: "aborted", reason: "사용자 중지" });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[chat] 턴 실패 turnId=${req.turnId}: ${message}`);
          await send({ type: "error", message });
        }
      } finally {
        inFlight.delete(req.turnId);
        await queue;
      }
    });
  })
  // 연결을 끊는 것만으로는 생성이 멈추지 않는다(서버가 백그라운드로 완주한다).
  // 중지 버튼은 반드시 이걸 불러야 한다.
  .post("/cancel", async (c) => {
    const parsed = cancelRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "잘못된 요청" }, 400);

    const controller = inFlight.get(parsed.data.turnId);
    controller?.abort();
    return c.json({ ok: true, found: !!controller });
  });
