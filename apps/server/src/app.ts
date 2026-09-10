import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { env } from "./env";
import { chatRoute } from "./routes/chat";
import { health } from "./routes/health";

// Hono 앱 조립. index.ts 와 분리해 테스트에서 app.fetch 를 직접 부를 수 있게 한다.
//
// 라우트는 소비자가 실재하는 것만 만든다:
//   /health          — 헬스체크 (공개)
//   /chat            — SSE 스트리밍 (web BFF, mobile)
//   /chat/cancel     — 진행 중인 턴 중지
//   /memories        — 기억 CRUD
//   /conversations   — 대화방
//   /settings        — 시스템 프롬프트
//   /mcp             — 외부 MCP 클라이언트(Claude Desktop) 전용
export const app = new Hono();

// 기본 잠금 + /health 만 예외. 반대로(보호할 경로를 나열) 짜면 라우트를 추가하다
// 하나 빠뜨리는 순간 공개된다.
app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  return bearerAuth({ token: env.apiToken })(c, next);
});

app.route("/health", health);
app.route("/chat", chatRoute);

// TODO: /memories, /conversations, /settings, /mcp
