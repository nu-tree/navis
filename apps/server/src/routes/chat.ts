import { Hono } from "hono";
import type { AppEnv } from "../types";
import * as turns from "../turns";
import { streamSSE } from "hono/streaming";
import { chat, conversation, push } from "@navis/domain";
import { isClaudeTokenError, isNotFound } from "@navis/domain/errors";
import {
  cancelRequestSchema,
  chatRequestSchema,
  type ChatEvent,
  type Message,
} from "@navis/validation";

// 진행 중인 턴. 상주 서버라 프로세스 로컬 Map 으로 충분하다 — 중지가 DB 신호
// 없이 즉시 동작한다.
//
// ★ 이건 DB 로 옮기지 않는다. 중지는 생성이 도는 **그 프로세스**에서만 의미가 있고,
//   서버 인스턴스가 하나이기 때문이다. DB 에 두면 신호를 폴링해야 하고, 그래도
//   다른 인스턴스의 AbortController 는 부를 수 없다.
//
// 값에 회원을 함께 둔다 — 중지는 **같은 회원의** 턴만 멈춘다(specs/002 R7). 남의 turnId 를 알아도
// 멈출 수 없다.
const inFlight = new Map<string, { controller: AbortController; userId: string }>();

/** 세션을 새로 열 때 앞에 붙일 최근 메시지 수(specs/003 R8). withHistory 의 한도와 같다. */
const HISTORY_MESSAGES = 20;

/** 회원의 기기들로 푸시. 사용자가 중지한 턴은 알리지 않는다 — 본인이 지금 보고 있다. */
const notifyAnswer = (userId: string, conversationId: string, body: string) => {
  push.notify(userId, { title: "나비스", body, conversationId }).catch((err: unknown) => {
    console.error(`[chat] 푸시 실패: ${err instanceof Error ? err.message : String(err)}`);
  });
};

export const chatRoute = new Hono<AppEnv>()
  .post("/", async (c) => {
    const parsed = chatRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    }
    const req = parsed.data;
    const userId = c.get("userId");

    // 같은 방에 진행 중인 턴이 있으면 막는다. 클라이언트도 막지만(FR-008) 새로고침으로 우회되므로
    // 서버에서도 막는다. 여기서 자리를 잡고, 스트림을 열기 전에 실패하면 풀어 준다.
    // 회원도 함께 올린다 — 약속 실행이 이 회원의 대화가 끝나길 기다린다(specs/003 R4).
    if (!turns.begin(req.conversationId, userId)) {
      return c.json({ error: "이미 진행 중인 턴이 있다." }, 409);
    }

    // ★ 스트림을 열기 **전에** 방 생성과 사용자 메시지 기록을 끝낸다(FR-048, R9).
    //   여기서 커밋해야 그 뒤 서버가 언제 죽어도 사용자가 쓴 글이 남는다.
    //   실패하면 스트림을 열지 않고 평범한 오류 응답을 준다 — SSE 안에서 실패하면
    //   화면이 "빈 답변"으로 보게 된다.
    //
    //   남의 방 id 면 ensure 가 NotFoundError — 스트림을 열지 않고 404, 질문도 기록하지 않는다
    //   (specs/002 contracts/identity.md).
    let resumeSessionId: string | null = null;
    // 지금 세션으로 이어 쓴 턴 수. 한도에 닿으면 새 세션으로 시작한다(specs/003 R8).
    let sessionTurns = 0;
    // 이번 질문을 붙이기 **전**의 최근 메시지. 세션을 이어갈 수 없을 때 맥락 복원에 쓴다
    // (domain/chat 의 liveSessions 주석). 방 전체를 읽지 않는다 — 끝없이 긴 "나비스" 방이 있다.
    let history: Message[] = [];
    try {
      const room = await conversation.ensure(userId, req.conversationId, req.text);
      if (!conversation.shouldStartFreshSession(room)) {
        resumeSessionId = room.sessionId;
        sessionTurns = room.sessionTurns;
      }
      history = await conversation.recentForHistory(userId, req.conversationId, HISTORY_MESSAGES);
      await conversation.appendMessage(userId, req.conversationId, {
        role: "user",
        text: req.text,
        // 첨부는 이 턴의 입력으로만 쓰고 원본을 남기지 않는다(스키마 주석).
      });
    } catch (err) {
      turns.end(req.conversationId);
      if (isNotFound(err)) return c.json({ error: "대화방을 찾을 수 없다." }, 404);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[chat] 사용자 메시지 기록 실패 turnId=${req.turnId}: ${message}`);
      return c.json({ error: message }, 500);
    }

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
      inFlight.set(req.turnId, { controller: abortController, userId });

      try {
        const result = await chat.runTurn(
          {
            userId,
            conversationId: req.conversationId,
            prompt: req.text,
            resumeSessionId,
            history,
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
        // 같은 세션을 이어 썼으면 턴 수를 올리고, 새 세션이면 1 부터 센다(specs/003 R8).
        if (result.sessionId) {
          const continued = result.sessionId === resumeSessionId;
          await conversation.setSessionId(
            userId,
            req.conversationId,
            result.sessionId,
            continued ? sessionTurns + 1 : 1,
          );
        }

        // 답변은 턴이 완료된 시점에 기록한다(FR-048). 중단되면 기록되지 않는다.
        const message = await conversation.appendMessage(userId, req.conversationId, {
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
        // 창을 닫았거나 다른 앱에 가 있는 사람을 부른다. 기다리지 않는다 — 실패해도 답은 이미 기록됐다.
        notifyAnswer(userId, req.conversationId, push.excerpt(result.text) || "답변이 도착했어요.");
      } catch (err) {
        if (abortController.signal.aborted) {
          // 부분 답변은 기록하지 않는다(Q3=B). 남는 것은 사용자의 질문뿐이다.
          await send({ type: "aborted", reason: "사용자 중지" });
        } else if (isClaudeTokenError(err)) {
          // 토큰 문제는 종류(code)로 싣는다 — 화면이 설정 화면으로 안내한다(FR-056).
          // 사용자 질문은 이미 기록됐다(FR-048).
          console.error(`[chat] 토큰 오류 turnId=${req.turnId}: ${err.kind}`);
          await send({ type: "error", message: err.message, code: err.kind });
          notifyAnswer(userId, req.conversationId, `⚠️ ${err.message}`);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[chat] 턴 실패 turnId=${req.turnId}: ${message}`);
          await send({ type: "error", message });
          notifyAnswer(userId, req.conversationId, `⚠️ ${message}`);
        }
      } finally {
        inFlight.delete(req.turnId);
        turns.end(req.conversationId);
        await queue;
      }
    });
  })
  // 연결을 끊는 것만으로는 생성이 멈추지 않는다(서버가 백그라운드로 완주한다).
  // 중지 버튼은 반드시 이걸 불러야 한다.
  .post("/cancel", async (c) => {
    const parsed = cancelRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "잘못된 요청" }, 400);

    const turn = inFlight.get(parsed.data.turnId);
    // 남의 턴은 없는 것과 같다 — 멈추지 않고 found: false.
    const mine = turn && turn.userId === c.get("userId") ? turn : null;
    mine?.controller.abort();
    return c.json({ ok: true, found: !!mine });
  });
