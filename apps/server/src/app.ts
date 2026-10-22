import { Hono, type MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { timingSafeEqual } from "node:crypto";
import { mcpAccess } from "@navis/domain";
import { env } from "./env";
import { isOwner } from "./owner";
import type { AppEnv } from "./types";
import { chatRoute } from "./routes/chat";
import { health } from "./routes/health";
import { internalRoute } from "./routes/internal";
import { conversationsRoute } from "./routes/conversations";
import { mcpRoute } from "./routes/mcp";
import { connectionsRoute } from "./routes/connections";
import { oauthRoute } from "./routes/oauth";
import { memoriesRoute } from "./routes/memories";
import { pushRoute } from "./routes/push";
import { relaysRoute } from "./routes/relays";
import { settingsRoute } from "./routes/settings";

// Hono 앱 조립. index.ts 와 분리해 테스트에서 app.fetch 를 직접 부를 수 있게 한다.
//
// 라우트는 소비자가 실재하는 것만 만든다:
//   /health          — 헬스체크 (공개)
//   /chat            — SSE 스트리밍 (web BFF, mobile)
//   /chat/cancel     — 진행 중인 턴 중지
//   /memories        — 기억 CRUD (지우기는 관리자만)
//   /me              — 요청 회원이 관리자인지 (web 이 지우기 버튼을 보일지 정한다)
//   /conversations   — 대화방
//   /settings        — Claude 구독 토큰 (US5)
//   /push            — 웹 푸시 구독 (창을 닫아도 답 도착 알림)
//   /mcp             — 외부 MCP (Claude Code · claude.ai). web /api/mcp 를 거쳐 들어온다. 회원마다 자기 토큰
//   /connections     — 회원의 MCP 연결 목록 · 직접 발급 · 끊기
//   /oauth           — MCP 인가(로그인으로 연결). web 의 .well-known · 동의 화면이 부른다
//   /internal/tick   — 약속 실행 (Cloud Scheduler 전용, specs/003). web /api/internal/tick 을 거친다
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
const tickAuth = env.tickToken
  ? (bearerAuth({ token: env.tickToken }) as unknown as MiddlewareHandler<AppEnv>)
  : null;

/** 회원 헤더를 보지 않는 경로 — 자기 토큰으로만 열린다. */
const TICK_PATH = "/internal/tick";

/**
 * OAuth 중 회원이 아직 없는 단계(클라이언트 등록 · 코드 교환). API_TOKEN 으로는 잠그되 회원 헤더는 보지 않는다 —
 * Claude 가 부르는 것이라 로그인 세션이 없다. 회원은 코드에 이미 묶여 있다.
 */
const OAUTH_ANONYMOUS_PATHS = new Set(["/oauth/register", "/oauth/token"]);

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * MCP Bearer → 회원. 환경변수 토큰(NAVIS_MCP_TOKEN)은 예전처럼 관리자의 것이고, 나머지는 회원이 발급받은
 * 토큰(mcp_tokens)이다. 모르는 토큰이면 null.
 */
const mcpUser = async (header: string | undefined): Promise<string | null> => {
  const token = /^Bearer\s+(.+)$/i.exec(header ?? "")?.[1]?.trim();
  if (!token) return null;
  if (env.mcpToken && sameText(token, env.mcpToken)) return env.ownerId;
  return mcpAccess.verify(token);
};

// 기본 잠금 + /health 만 예외. 반대로(보호할 경로를 나열) 짜면 라우트를 추가하다
// 하나 빠뜨리는 순간 공개된다.
//
// /mcp 는 **MCP 토큰으로만** 연다. API_TOKEN 으로는 /mcp 를, MCP 토큰으로는 나머지를
// 부를 수 없다 — 두 자격이 서로의 범위로 새지 않는다(헌장 보안 절).
app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (c.req.path === "/mcp") {
    // 회원은 토큰이 정한다 — x-navis-user 는 보지 않는다(specs/002 FR-113 개정).
    const userId = await mcpUser(c.req.header("authorization"));
    // WWW-Authenticate 는 web 이 resource_metadata 를 붙여 다시 쓴다 — Claude 가 이걸 보고 로그인을 시작한다.
    if (!userId) return c.json({ error: "MCP 토큰이 없거나 맞지 않는다." }, 401, { "www-authenticate": "Bearer" });
    c.set("userId", userId);
    return next();
  }
  // 약속 tick 도 자기 토큰으로만 연다. 회원 요청이 아니다 — 약속마다 주인 회원이 있다(specs/003 R10).
  if (c.req.path === TICK_PATH) {
    if (!tickAuth) return c.json({ error: "tick 이 설정되지 않았다." }, 404);
    return tickAuth(c, next);
  }
  return apiAuth(c, next);
});

// 서버 토큰을 통과한 요청에 회원을 붙인다. /health · /mcp 는 위에서 끝났다.
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (path === "/health" || path === "/mcp" || path === TICK_PATH || OAUTH_ANONYMOUS_PATHS.has(path)) return next();
  const userId = resolveUser(c.req.header("x-navis-user"));
  if (!userId) return c.json({ error: "회원을 알 수 없다." }, 401);
  c.set("userId", userId);
  return next();
});


app.get("/me", (c) => c.json({ admin: isOwner(c.get("userId")) }));

// 기억 지우기는 관리자만 한다. 초대한 회원이 "꼬일까봐" 기억을 전부 지운 일이 있었다(2026-10) —
// 기억이 쌓여야 나비스가 쓸모 있으므로 회원은 보고 고치기만 한다. 대화 중 에이전트의 remove 도구는
// domain 을 직접 부르므로 여기 걸리지 않는다 — 말로 콕 집어 지우는 길은 남겨 둔다.
app.delete("/memories/:id", async (c, next) => {
  if (!isOwner(c.get("userId"))) return c.json({ error: "기억 지우기는 관리자만 할 수 있다." }, 403);
  return next();
});

// 전하기는 관리자만 한다(specs/004 FR-001). 목록 · 회원 목록까지 전부 — 다른 회원이 누구인지도 알려주지 않는다(FR-002).
app.use("/relays/*", async (c, next) => {
  if (!isOwner(c.get("userId"))) return c.json({ error: "말 걸기는 관리자만 할 수 있다." }, 403);
  return next();
});

app.route("/health", health);
app.route("/chat", chatRoute);
app.route("/memories", memoriesRoute);
app.route("/conversations", conversationsRoute);
app.route("/mcp", mcpRoute);
app.route("/connections", connectionsRoute);
app.route("/oauth", oauthRoute);
app.route("/settings", settingsRoute);
app.route("/push", pushRoute);
app.route("/internal", internalRoute);
app.route("/relays", relaysRoute);
