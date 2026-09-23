import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { chat, conversation } from "@navis/domain";
import {
  cancelRequestSchema,
  chatRequestSchema,
  type ChatEvent,
} from "@navis/validation";

// 진행 중인 턴. 상주 서버라 프로세스 로컬 Map 으로 충분하다 — 중지가 DB 신호
// 없이 즉시 동작한다.
//
// ★ 이건 DB 로 옮기지 않는다. 중지는 생성이 도는 **그 프로세스**에서만 의미가 있고,
//   서버 인스턴스가 하나이기 때문이다. DB 에 두면 신호를 폴링해야 하고, 그래도
//   다른 인스턴스의 AbortController 는 부를 수 없다.
const inFlight = new Map<string, AbortController>();

// 같은 방에 진행 중인 턴. 클라이언트도 막지만(FR-008) 새로고침으로 우회되므로
// 서버에서도 막는다.
const activeConversations = new Set<string>();

export const chatRoute = new Hono()
  .post("/", async (c) => {
    const parsed = chatRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    }
    const req = parsed.data;

    if (activeConversations.has(req.conversationId)) {
      return c.json({ error: "이미 진행 중인 턴이 있다." }, 409);
    }

    // ★ 스트림을 열기 **전에** 방 생성과 사용자 메시지 기록을 끝낸다(FR-048, R9).
    //   여기서 커밋해야 그 뒤 서버가 언제 죽어도 사용자가 쓴 글이 남는다.
    //   실패하면 스트림을 열지 않고 평범한 오류 응답을 준다 — SSE 안에서 실패하면
    //   화면이 "빈 답변"으로 보게 된다.
    let resumeSessionId: string | null = null;
    try {
      const room = await conversation.ensure(req.conversationId, req.text);
      resumeSessionId = room.sessionId;
      await conversation.appendMessage(req.conversationId, {
        role: "user",
        text: req.text,
        // 첨부는 이 턴의 입력으로만 쓰고 원본을 남기지 않는다(스키마 주석).
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[chat] 사용자 메시지 기록 실패 turnId=${req.turnId}: ${message}`);
      return c.json({ error: message }, 500);
    }

    activeConversations.add(req.conversationId);

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
            resumeSessionId,
            model: req.model,
            abortController,
            ...(req.images?.length ? { images: req.images } : {}),
          },
          {
            onDelta: (text) => void send({ type: "delta", text }),
            onThinking: (text) => void send({ type: "thinking", text }),
            onStatus: (tool) => void send({ type: "status", tool }),
          },
        );

        // 세션 id 는 result 가 권위다. DB 에 둬야 재시작 후에도 맥락이 이어진다(R10).
        if (result.sessionId && result.sessionId !== resumeSessionId) {
          await conversation.setSessionId(req.conversationId, result.sessionId);
        }

        // 답변은 턴이 완료된 시점에 기록한다(FR-048). 중단되면 기록되지 않는다.
        const message = await conversation.appendMessage(req.conversationId, {
          role: "assistant",
          text: result.text,
          ...(result.toolsUsed.length ? { toolsUsed: result.toolsUsed } : {}),
          // 메시지에도 담는다 — done 이벤트만 보면 방을 다시 열 때 표시가 사라진다.
          ...(result.savedCount > 0 ? { saved: true } : {}),
        });

        await send({
          type: "done",
          message,
          sessionId: result.sessionId,
          // 이 턴에 실제로 저장된 기억이 있는지. 화면의 저장 표시 조건이 이것뿐이다.
          saved: result.savedCount > 0,
        });
      } catch (err) {
        if (abortController.signal.aborted) {
          // 부분 답변은 기록하지 않는다(Q3=B). 남는 것은 사용자의 질문뿐이다.
          await send({ type: "aborted", reason: "사용자 중지" });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[chat] 턴 실패 turnId=${req.turnId}: ${message}`);
          await send({ type: "error", message });
        }
      } finally {
        inFlight.delete(req.turnId);
        activeConversations.delete(req.conversationId);
        await queue;
      }
    });
  })
  // 연결을 끊는 것만으로는 생성이 멈추지 않는다(서버가 백그라운드로 완주한다).
  // 중지 버튼은 반드시 이걸 불러야 한다.
  .post("/cancel", async (c) => {
    const parsed = cancelRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "잘못된 요청" }, 400);

    const controller = inFlight.get(parsed.data.turnId);
    controller?.abort();
    return c.json({ ok: true, found: !!controller });
  });
