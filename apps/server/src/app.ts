import { Hono, type MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { env } from "./env";
import type { AppEnv } from "./types";
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
export const app = new Hono<AppEnv>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 요청의 회원(specs/002 contracts/identity.md).
 *
 * BFF 가 세션을 확인한 뒤 `x-navis-user` 를 붙인다. 이 헤더는 서버 토큰(API_TOKEN)이 맞을 때만
 * 믿는다 — 서버 토큰을 쥔 호출자는 BFF 뿐이고, BFF 는 브라우저가 보낸 이 헤더를 넘기지 않는다.
 * `owner` 는 로그인이 꺼진 로컬 개발에서만 온다.
 *
 * ★ 없거나 이상하면 401. 관리자로 떨어뜨리지 않는다 — BFF 가 헤더를 빠뜨리는 버그가 생겨도
 *   관리자 데이터가 새는 대신 막힌다.
 */
const resolveUser = (raw: string | undefined): string | null => {
  if (raw === "owner") return env.ownerId;
  return raw && UUID.test(raw) ? raw.toLowerCase() : null;
};

// bearerAuth 는 기본 Env 로 타입이 잡혀 있다. 하는 일(헤더 비교)은 Env 와 무관하므로 맞춰 쓴다.
const apiAuth = bearerAuth({ token: env.apiToken }) as unknown as MiddlewareHandler<AppEnv>;
const mcpAuth = env.mcpToken
  ? (bearerAuth({ token: env.mcpToken }) as unknown as MiddlewareHandler<AppEnv>)
  : null;

// 기본 잠금 + /health 만 예외. 반대로(보호할 경로를 나열) 짜면 라우트를 추가하다
// 하나 빠뜨리는 순간 공개된다.
//
// /mcp 는 **자기 토큰으로만** 연다. API_TOKEN 으로는 /mcp 를, MCP 토큰으로는 나머지를
// 부를 수 없다 — 두 자격이 서로의 범위로 새지 않는다(헌장 보안 절).
app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (c.req.path === "/mcp") {
    if (!mcpAuth) return c.json({ error: "MCP 가 설정되지 않았다." }, 404);
    // 외부 MCP 는 관리자 전용이다 — 헤더를 보지 않는다(specs/002 FR-113).
    c.set("userId", env.ownerId);
    return mcpAuth(c, next);
  }
  return apiAuth(c, next);
});

// 서버 토큰을 통과한 요청에 회원을 붙인다. /health · /mcp 는 위에서 끝났다.
app.use("*", async (c, next) => {
  if (c.req.path === "/health" || c.req.path === "/mcp") return next();
  const userId = resolveUser(c.req.header("x-navis-user"));
  if (!userId) return c.json({ error: "회원을 알 수 없다." }, 401);
  c.set("userId", userId);
  return next();
});

app.route("/health", health);
app.route("/chat", chatRoute);
app.route("/memories", memoriesRoute);
app.route("/conversations", conversationsRoute);
app.route("/mcp", mcpRoute);
app.route("/settings", settingsRoute);
