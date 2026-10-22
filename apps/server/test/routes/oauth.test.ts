// MCP 인가 라우트. 지키는 것:
//   1) 등록 · 교환은 API_TOKEN 만 있으면 된다(회원 헤더 없음) — Claude 가 부르는 단계라 세션이 없다
//   2) 허용 · 클라이언트 조회는 회원이 있어야 한다
//   3) 교환은 규격대로 form-urlencoded 를 받고, 실패는 { error } 400 이다
// domain 은 mock 한다 — 코드 · PKCE 판정은 domain 테스트가 실제 DB 로 본다.
import { describe, expect, it, vi } from "vitest";

const API_TOKEN = "test-api-token";
vi.stubEnv("API_TOKEN", API_TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
vi.stubEnv("NAVIS_OWNER_ID", "00000000-0000-4000-8000-000000000001");

const MEMBER = "00000000-0000-4000-8000-0000000000a1";

class OAuthError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
const authorize = vi.fn(async (_u: string, _i: unknown) => "https://claude.ai/cb?code=c&state=s");
const exchangeCode = vi.fn(async (i: { code: string }) => {
  if (i.code !== "good") throw new OAuthError("invalid_grant", "만료");
  return { access_token: "navis_x", token_type: "Bearer" };
});
vi.mock("@navis/domain", () => ({
  mcpAccess: {
    OAuthError,
    registerClient: vi.fn(async (i: { client_name?: string; redirect_uris: string[] }) => ({
      id: "client-1",
      name: i.client_name ?? "MCP 클라이언트",
      redirectUris: i.redirect_uris,
      createdAt: new Date(0),
    })),
    clientInfo: vi.fn(async (id: string) =>
      id === "client-1" ? { id, name: "Claude", redirectHosts: ["claude.ai"] } : null,
    ),
    authorize,
    exchangeCode,
    verify: vi.fn(async () => null),
  },
  memory: {},
  conversation: {},
  settings: {},
  chat: {},
}));

const { app } = await import("../../src/app");

const call = (path: string, init: RequestInit & { member?: boolean } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${API_TOKEN}`);
  if (init.member) headers.set("x-navis-user", MEMBER);
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }));
};

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const verifier = "v".repeat(43);

describe("/oauth/register", () => {
  it("회원 헤더 없이 201 + client_id", async () => {
    const res = await call("/oauth/register", json({ client_name: "Claude", redirect_uris: ["https://claude.ai/cb"] }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ client_id: "client-1", token_endpoint_auth_method: "none" });
  });

  it("API_TOKEN 이 없으면 401", async () => {
    const res = await app.fetch(new Request("http://localhost/oauth/register", json({ redirect_uris: ["https://a.b"] })));
    expect(res.status).toBe(401);
  });

  it("redirect_uris 없으면 invalid_request", async () => {
    const res = await call("/oauth/register", json({ client_name: "x" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request" });
  });
});

describe("/oauth/token", () => {
  const form = (code: string, grant = "authorization_code") => ({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: grant,
      code,
      client_id: "client-1",
      redirect_uri: "https://claude.ai/cb",
      code_verifier: verifier,
    }).toString(),
  });

  it("form 으로 받아 토큰을 준다 — 캐시 금지", async () => {
    const res = await call("/oauth/token", form("good"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ access_token: "navis_x", token_type: "Bearer" });
  });

  it("틀린 코드는 invalid_grant 400", async () => {
    const res = await call("/oauth/token", form("bad"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("refresh_token 같은 다른 grant 는 unsupported_grant_type", async () => {
    const res = await call("/oauth/token", form("good", "refresh_token"));
    expect(await res.json()).toEqual({ error: "unsupported_grant_type" });
  });
});

describe("/oauth/authorize · /oauth/clients", () => {
  const input = {
    client_id: "client-1",
    redirect_uri: "https://claude.ai/cb",
    code_challenge: "c".repeat(43),
    code_challenge_method: "S256",
    state: "s",
  };

  it("회원 없이는 401", async () => {
    expect((await call("/oauth/authorize", json(input))).status).toBe(401);
    expect((await call("/oauth/clients/client-1")).status).toBe(401);
  });

  it("허용하면 그 회원으로 코드를 만든다", async () => {
    const res = await call("/oauth/authorize", { ...json(input), member: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ redirectTo: "https://claude.ai/cb?code=c&state=s" });
    expect(authorize).toHaveBeenCalledWith(MEMBER, input);
  });

  it("plain PKCE 는 받지 않는다", async () => {
    const res = await call("/oauth/authorize", { ...json({ ...input, code_challenge_method: "plain" }), member: true });
    expect(res.status).toBe(400);
  });

  it("모르는 클라이언트는 404", async () => {
    expect((await call("/oauth/clients/nope", { member: true })).status).toBe(404);
    expect((await call("/oauth/clients/client-1", { member: true })).status).toBe(200);
  });
});
