import { Hono, type Context } from "hono";
import type { AppEnv } from "../types";
import { conversation } from "@navis/domain";
import { isMainRoomUndeletable, isNotFound } from "@navis/domain/errors";
import { MESSAGE_PAGE_MAX, MESSAGE_PAGE_SIZE } from "@navis/validation";

// 대화방 라우트. 인증은 app.ts 의 기본 잠금이 이미 걸어뒀다.
//
// ★ 방 생성 전용 엔드포인트는 만들지 않는다 — 첫 메시지를 보낼 때 POST /chat 이
//   겸한다. 쓰는 곳이 없는 라우트를 미리 만들지 않는다(헌장 원칙 I).

function failure(c: Context, err: unknown) {
  // 오류의 **종류**로 판정한다. 메시지 문자열로 분기하면 문구를 다듬을 때
  // 404 가 500 이 된다(FR-041, STRUCTURE.md 7항).
  if (isNotFound(err)) return c.json({ error: err.message }, 404);
  // "나비스" 방은 지울 수 없다(specs/003 R9).
  if (isMainRoomUndeletable(err)) return c.json({ error: err.message }, 409);

  const message = err instanceof Error ? err.message : String(err);
  console.error(`[conversations] 실패: ${message}`);
  return c.json({ error: message }, 500);
}

export const conversationsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    try {
      // 메시지를 싣지 않는 요약만 반환한다(FR-032). 메인 방을 보장하고 맨 위에 둔다(specs/003 R9).
      return c.json(await conversation.list(c.get("userId")));
    } catch (err) {
      return failure(c, err);
    }
  })
  // 이전 메시지 한 페이지(specs/003 FR-026). before 는 지금 화면의 가장 오래된 메시지 id.
  .get("/:id/messages", async (c) => {
    const before = c.req.query("before");
    const rawLimit = c.req.query("limit");
    const limit = rawLimit === undefined ? MESSAGE_PAGE_SIZE : Number(rawLimit);
    if (!before || !Number.isInteger(limit) || limit < 1 || limit > MESSAGE_PAGE_MAX) {
      return c.json({ error: `before 가 필요하고 limit 은 1~${MESSAGE_PAGE_MAX} 이어야 한다.` }, 400);
    }
    try {
      return c.json(await conversation.page(c.get("userId"), c.req.param("id"), before, limit));
    } catch (err) {
      return failure(c, err);
    }
  })
  .get("/:id", async (c) => {
    try {
      return c.json(await conversation.get(c.get("userId"), c.req.param("id")));
    } catch (err) {
      return failure(c, err);
    }
  })
  .delete("/:id", async (c) => {
    try {
      // 그 방에서 저장된 기억은 남는다 — 기억은 방과 독립이다(FR-015).
      await conversation.remove(c.get("userId"), c.req.param("id"));
      return c.json({ ok: true });
    } catch (err) {
      return failure(c, err);
    }
  })
  .delete("/:id/messages/:messageId", async (c) => {
    try {
      await conversation.removeMessage(
        c.get("userId"),
        c.req.param("id"),
        c.req.param("messageId"),
      );
      return c.json({ ok: true });
    } catch (err) {
      return failure(c, err);
    }
  });
