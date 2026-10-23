import { Hono } from "hono";
import { feedback } from "@navis/domain";
import { isNotFound } from "@navis/domain/errors";
import { feedbackUpdateInputSchema } from "@navis/validation";
import type { AppEnv } from "../types";

// 피드백 — 관리자 전용. 관리자 판정은 app.ts 가 이 라우트 앞에서 한다. 넣기는 회원 대화의 도구만 한다.

export const feedbackRoute = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await feedback.list()))
  .patch("/:id", async (c) => {
    const parsed = feedbackUpdateInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    try {
      return c.json(await feedback.setDone(c.req.param("id"), parsed.data.done));
    } catch (err) {
      if (isNotFound(err)) return c.json({ error: "그런 피드백이 없다." }, 404);
      throw err;
    }
  });
