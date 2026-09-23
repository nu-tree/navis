import { Hono, type Context } from "hono";
import { conversation } from "@navis/domain";
import { isNotFound } from "@navis/domain/errors";

// 대화방 라우트. 인증은 app.ts 의 기본 잠금이 이미 걸어뒀다.
//
// ★ 방 생성 전용 엔드포인트는 만들지 않는다 — 첫 메시지를 보낼 때 POST /chat 이
//   겸한다. 쓰는 곳이 없는 라우트를 미리 만들지 않는다(헌장 원칙 I).

function failure(c: Context, err: unknown) {
  // 오류의 **종류**로 판정한다. 메시지 문자열로 분기하면 문구를 다듬을 때
  // 404 가 500 이 된다(FR-041, STRUCTURE.md 7항).
  if (isNotFound(err)) return c.json({ error: err.message }, 404);

  const message = err instanceof Error ? err.message : String(err);
  console.error(`[conversations] 실패: ${message}`);
  return c.json({ error: message }, 500);
}

export const conversationsRoute = new Hono()
  .get("/", async (c) => {
    try {
      // messages 를 싣지 않는 요약만 반환한다(FR-032).
      return c.json(await conversation.list());
    } catch (err) {
      return failure(c, err);
    }
  })
  .get("/:id", async (c) => {
    try {
      return c.json(await conversation.get(c.req.param("id")));
    } catch (err) {
      return failure(c, err);
    }
  })
  .delete("/:id", async (c) => {
    try {
      // 그 방에서 저장된 기억은 남는다 — 기억은 방과 독립이다(FR-015).
      await conversation.remove(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err) {
      return failure(c, err);
    }
  })
  .delete("/:id/messages/:messageId", async (c) => {
    try {
      await conversation.removeMessage(
        c.req.param("id"),
        c.req.param("messageId"),
      );
      return c.json({ ok: true });
    } catch (err) {
      return failure(c, err);
    }
  });
