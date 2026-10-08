import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { env } from "./env";
import { chatRoute } from "./routes/chat";
import { health } from "./routes/health";
import { conversationsRoute } from "./routes/conversations";
import { mcpRoute } from "./routes/mcp";
import { memoriesRoute } from "./routes/memories";
import { settingsRoute } from "./routes/settings";

// Hono 앱 조립. index.ts 와 분리해 테스트에서 app.fetch 를 직접 부를 수 있게 한다.
//
// 라우트는 소비자가 실재하는 것만 만든다:
//   /health          — 헬스체크 (공개)
//   /chat            — SSE 스트리밍 (web BFF, mobile)
//   /chat/cancel     — 진행 중인 턴 중지
//   /memories        — 기억 CRUD
//   /conversations   — 대화방
//   /settings        — Claude 구독 토큰 (US5)
//   /mcp             — 외부 MCP (Claude Code). web /api/mcp 를 거쳐 들어온다
export const app = new Hono();

// 기본 잠금 + /health 만 예외. 반대로(보호할 경로를 나열) 짜면 라우트를 추가하다
// 하나 빠뜨리는 순간 공개된다.
//
// /mcp 는 **자기 토큰으로만** 연다. API_TOKEN 으로는 /mcp 를, MCP 토큰으로는 나머지를
// 부를 수 없다 — 두 자격이 서로의 범위로 새지 않는다(헌장 보안 절).
app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (c.req.path === "/mcp") {
    if (!env.mcpToken) return c.json({ error: "MCP 가 설정되지 않았다." }, 404);
    return bearerAuth({ token: env.mcpToken })(c, next);
  }
  return bearerAuth({ token: env.apiToken })(c, next);
});

app.route("/health", health);
app.route("/chat", chatRoute);
app.route("/memories", memoriesRoute);
app.route("/conversations", conversationsRoute);
app.route("/mcp", mcpRoute);
app.route("/settings", settingsRoute);
