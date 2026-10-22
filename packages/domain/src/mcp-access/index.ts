// 외부 MCP 연결 — 회원이 자기 나비스를 Claude Code · claude.ai · 데스크톱에 붙인다(specs/002 FR-113 개정).
//
// 길은 둘이다.
//   1) OAuth — Claude 가 MCP 규격대로 클라이언트를 등록하고(registerClient), 회원이 동의 화면에서 허용하면
//      (authorize) 코드를 토큰으로 바꾼다(exchangeCode). 회원은 아무것도 복사하지 않는다.
//   2) 직접 발급 — 헤더를 손으로 넣는 클라이언트용. 원문을 한 번 보여주고 끝(issue).
// 어느 길이든 결과는 mcp_tokens 의 행 하나이고, /mcp 는 verify 로 토큰 → 회원을 찾는다.
//
// ★ 토큰 · 코드 원문은 저장하지 않는다 — sha256 해시만. 무작위 32바이트라 솔트가 필요 없다.

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { db, mcpTokens, oauthClients, oauthCodes } from "@navis/db";
import type {
  McpConnection,
  McpTokenIssued,
  OAuthAuthorizeInput,
  OAuthClientInfo,
  OAuthClientRegistration,
  OAuthTokenInput,
} from "@navis/validation";

const TOKEN_PREFIX = "navis_";
const CODE_TTL_MS = 10 * 60_000;
/** 마지막 사용 시각은 이만큼 지났을 때만 쓴다 — 도구 호출마다 쓰기가 생기지 않게. */
const TOUCH_EVERY_MS = 10 * 60_000;

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const secret = () => randomBytes(32).toString("base64url");

type Row = typeof mcpTokens.$inferSelect;
const toConnection = (r: Row): McpConnection => ({
  id: r.id,
  label: r.label,
  kind: r.clientId ? "oauth" : "token",
  createdAt: r.createdAt.toISOString(),
  lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
});

async function insertToken(userId: string, label: string, clientId: string | null) {
  const token = TOKEN_PREFIX + secret();
  const [row] = await db
    .insert(mcpTokens)
    .values({ id: randomUUID(), userId, tokenHash: hash(token), label, clientId })
    .returning();
  return { token, row: row! };
}

// ── 연결 관리(설정 화면) ───────────────────────────────────────────────────

export async function list(userId: string): Promise<McpConnection[]> {
  const rows = await db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId))
    .orderBy(desc(mcpTokens.createdAt));
  return rows.map(toConnection);
}

/** 직접 발급. 원문은 이 반환값에만 있다. */
export async function issue(userId: string, label = "직접 연결"): Promise<McpTokenIssued> {
  const { token, row } = await insertToken(userId, label, null);
  return { token, connection: toConnection(row) };
}

/** 끊기. 자기 연결만 지운다 — 남의 id 면 false(라우트가 404). */
export async function revoke(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(mcpTokens)
    .where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, userId)))
    .returning({ id: mcpTokens.id });
  return rows.length > 0;
}

/** /mcp 의 Bearer → 회원. 모르는 토큰이면 null. */
export async function verify(token: string): Promise<string | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ id: mcpTokens.id, userId: mcpTokens.userId, lastUsedAt: mcpTokens.lastUsedAt })
    .from(mcpTokens)
    .where(eq(mcpTokens.tokenHash, hash(token)));
  if (!row) return null;

  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    // 기다리지 않는다 — 기록 실패가 도구 호출을 막으면 안 된다.
    void db
      .update(mcpTokens)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(mcpTokens.id, row.id))
      .catch((err: unknown) => console.error(`[mcp-access] 사용 시각 기록 실패: ${err instanceof Error ? err.name : "Error"}`));
  }
  return row.userId;
}

// ── OAuth ────────────────────────────────────────────────────────────────

/** 규격 오류. 라우트가 { error: code, error_description } 400 으로 옮긴다(RFC 6749 §5.2). */
export class OAuthError extends Error {
  constructor(
    readonly code: "invalid_request" | "invalid_client" | "invalid_grant" | "invalid_redirect_uri",
    message: string,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https 이거나, 이 기기 안(loopback)의 http 만 받는다 — Claude Code 는 localhost 로 돌아온다. */
const isAllowedRedirect = (raw: string) => {
  const url = new URL(raw);
  if (url.hash) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
};

/**
 * 등록된 주소와 같은가. loopback 은 포트를 보지 않는다(RFC 8252 §7.3) — Claude Code 는 연결할 때마다
 * 빈 포트를 고르는데, 등록은 한 번만 할 수도 있다.
 */
const redirectMatches = (registered: string[], given: string) => {
  const g = new URL(given);
  return registered.some((r) => {
    if (r === given) return true;
    const u = new URL(r);
    return (
      u.protocol === "http:" &&
      LOOPBACK.has(u.hostname) &&
      g.protocol === "http:" &&
      g.hostname === u.hostname &&
      g.pathname === u.pathname &&
      g.search === u.search
    );
  });
};

export async function registerClient(input: OAuthClientRegistration) {
  if (!input.redirect_uris.every(isAllowedRedirect)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uri 는 https 이거나 localhost 여야 한다.");
  }
  const [row] = await db
    .insert(oauthClients)
    .values({ id: randomUUID(), name: input.client_name || "MCP 클라이언트", redirectUris: input.redirect_uris })
    .returning();
  return row!;
}

const findClient = async (id: string) =>
  (await db.select().from(oauthClients).where(eq(oauthClients.id, id)))[0] ?? null;

/** 동의 화면용. 모르는 클라이언트면 null. */
export async function clientInfo(id: string): Promise<OAuthClientInfo | null> {
  const client = await findClient(id);
  if (!client) return null;
  // loopback 은 포트를 빼고 보인다 — Claude Code 는 연결할 때마다 포트가 달라 숫자가 뜻이 없다.
  const hosts = [
    ...new Set(
      client.redirectUris.map((u) => {
        const url = new URL(u);
        return LOOPBACK.has(url.hostname) ? url.hostname : url.host;
      }),
    ),
  ];
  return { id: client.id, name: client.name, redirectHosts: hosts };
}

/** 회원이 "허용"을 눌렀다 → 코드를 붙인 redirect 주소. */
export async function authorize(userId: string, input: OAuthAuthorizeInput): Promise<string> {
  const client = await findClient(input.client_id);
  if (!client) throw new OAuthError("invalid_client", "등록되지 않은 클라이언트다.");
  if (!redirectMatches(client.redirectUris, input.redirect_uri)) {
    throw new OAuthError("invalid_redirect_uri", "등록되지 않은 redirect_uri 다.");
  }

  const code = secret();
  // 만료된 코드는 여기서 같이 치운다 — 따로 청소할 일정이 없다.
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date()));
  await db.insert(oauthCodes).values({
    codeHash: hash(code),
    clientId: client.id,
    userId,
    redirectUri: input.redirect_uri,
    codeChallenge: input.code_challenge,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  const url = new URL(input.redirect_uri);
  url.searchParams.set("code", code);
  if (input.state) url.searchParams.set("state", input.state);
  return url.toString();
}

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** 코드 → 토큰. 코드는 성공 · 실패와 무관하게 한 번 쓰면 사라진다. */
export async function exchangeCode(input: OAuthTokenInput): Promise<{ access_token: string; token_type: "Bearer" }> {
  const [row] = await db
    .delete(oauthCodes)
    .where(and(eq(oauthCodes.codeHash, hash(input.code)), gt(oauthCodes.expiresAt, new Date())))
    .returning();
  if (!row) throw new OAuthError("invalid_grant", "코드가 없거나 만료됐다.");
  if (row.clientId !== input.client_id || row.redirectUri !== input.redirect_uri) {
    throw new OAuthError("invalid_grant", "코드를 받은 클라이언트 · 주소와 다르다.");
  }
  const challenge = createHash("sha256").update(input.code_verifier).digest("base64url");
  if (!sameText(challenge, row.codeChallenge)) {
    throw new OAuthError("invalid_grant", "code_verifier 가 맞지 않는다.");
  }

  const client = await findClient(row.clientId);
  // 만료 없음 — 끊기(설정 화면)로만 끝난다. 갱신 토큰을 두지 않는 이유: 회원이 직접 끊는 것 말고
  // 끝날 이유가 없고, 만료를 두면 Claude 쪽에서 다시 로그인하라는 창이 뜬다.
  const { token } = await insertToken(row.userId, client?.name ?? "MCP 클라이언트", row.clientId);
  return { access_token: token, token_type: "Bearer" };
}
