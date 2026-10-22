import { Hono } from "hono";
import type { AppEnv } from "../types";
import { mcpAccess } from "@navis/domain";
import { mcpTokenInputSchema } from "@navis/validation";

// 외부 MCP 연결 관리 — 설정 화면의 "AI 앱에 연결"(specs/002 FR-113 개정). 인증은 app.ts 의 기본 잠금.
//
// ★ 토큰 원문은 POST(직접 발급) 응답에만 실린다. 목록에는 이름 · 시각만.
export const connectionsRoute = new Hono<AppEnv>()
  .get("/", async (c) => c.json({ items: await mcpAccess.list(c.get("userId")) }))
  .post("/", async (c) => {
    const body: unknown = await c.req.json().catch(() => ({}));
    const parsed = mcpTokenInputSchema.safeParse(body ?? {});
    if (!parsed.success) return c.json({ error: "이름은 60자까지입니다." }, 400);
    return c.json(await mcpAccess.issue(c.get("userId"), parsed.data.label), 201);
  })
  .delete("/:id", async (c) => {
    const removed = await mcpAccess.revoke(c.get("userId"), c.req.param("id")).catch(() => false);
    return removed ? c.json({ id: c.req.param("id") }) : c.json({ error: "연결을 찾을 수 없습니다." }, 404);
  });
