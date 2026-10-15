import { Hono } from "hono";
import { member, relay } from "@navis/domain";
import { isClaudeTokenError } from "@navis/domain/errors";
import { relayCreateInputSchema } from "@navis/validation";
import type { AppEnv } from "../types";

// 전하기 — 관리자 전용(specs/004 contracts/http.md). 관리자 판정은 app.ts 가 이 라우트 앞에서 한다.
// 여기 오는 요청은 이미 관리자다. 넣기만 하고 실행은 tick 이 한다(research R2).

export const relaysRoute = new Hono<AppEnv>()
  .get("/members", async (c) => c.json(await member.list()))
  .get("/", async (c) => c.json(await relay.list(c.get("userId"))))
  .post("/", async (c) => {
    const parsed = relayCreateInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);

    // 목록 밖의 회원에게는 보낼 수 없다 — 지운 회원 · 오타 uuid 로 아무도 없는 방을 만들지 않는다.
    const recipient = (await member.list()).find((m) => m.id === parsed.data.recipientId.toLowerCase());
    if (!recipient) return c.json({ error: "그런 회원이 없다." }, 404);

    try {
      return c.json(await relay.create(c.get("userId"), recipient, parsed.data.instruction), 201);
    } catch (err) {
      // 종류로 판정한다 — 문구로 분기하지 않는다(헌장 규약). 받는 회원의 토큰으로 대신 돌리지 않는다(FR-023).
      if (isClaudeTokenError(err) && err.kind === "claude_token_missing") {
        return c.json({ error: err.message, code: err.kind }, 409);
      }
      throw err;
    }
  });
