import { Hono, type Context } from "hono";
import type { AppEnv } from "../types";
import { mcpAccess } from "@navis/domain";
import {
  oauthAuthorizeInputSchema,
  oauthClientRegistrationSchema,
  oauthTokenInputSchema,
} from "@navis/validation";

// MCP 인가(OAuth 2.1 + PKCE) — claude.ai · Claude 데스크톱 · Claude Code 가 로그인으로 나비스를 붙인다.
// 바깥 주소(.well-known · /oauth/authorize 화면 · /api/oauth/*)는 web 이 갖고, 여기는 판정만 한다.
//
//   POST /oauth/register      동적 클라이언트 등록(RFC 7591) — 회원 없음, API_TOKEN 만
//   POST /oauth/token         코드 → 토큰                    — 회원 없음, API_TOKEN 만
//   GET  /oauth/clients/:id   동의 화면에 보일 클라이언트    — 회원
//   POST /oauth/authorize     회원이 "허용"을 눌렀다          — 회원
//
// 오류 본문은 OAuth 규격 모양({ error, error_description })이다 — web 이 그대로 Claude 에게 넘긴다.
export const oauthRoute = new Hono<AppEnv>()
  .post("/register", async (c) => {
    const parsed = oauthClientRegistrationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return oauthError(c, new mcpAccess.OAuthError("invalid_request", "redirect_uris 가 필요하다."));
    try {
      const client = await mcpAccess.registerClient(parsed.data);
      return c.json(
        {
          client_id: client.id,
          client_name: client.name,
          redirect_uris: client.redirectUris,
          client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
        201,
      );
    } catch (err) {
      return oauthError(c, err);
    }
  })
  .post("/token", async (c) => {
    // 규격은 form-urlencoded 다. JSON 으로 보내는 클라이언트도 받아준다.
    const type = c.req.header("content-type") ?? "";
    const body: unknown = type.includes("application/json")
      ? await c.req.json().catch(() => null)
      : Object.fromEntries(new URLSearchParams(await c.req.text()));
    const parsed = oauthTokenInputSchema.safeParse(body);
    if (!parsed.success) {
      const grant = (body as { grant_type?: unknown } | null)?.grant_type;
      return grant && grant !== "authorization_code"
        ? c.json({ error: "unsupported_grant_type" }, 400)
        : oauthError(c, new mcpAccess.OAuthError("invalid_request", "요청 형식이 맞지 않는다."));
    }
    try {
      return c.json(await mcpAccess.exchangeCode(parsed.data), 200, { "cache-control": "no-store" });
    } catch (err) {
      return oauthError(c, err);
    }
  })
  .get("/clients/:id", async (c) => {
    const info = await mcpAccess.clientInfo(c.req.param("id"));
    return info ? c.json(info) : c.json({ error: "등록되지 않은 앱입니다. 앱에서 연결을 다시 시작해주세요." }, 404);
  })
  .post("/authorize", async (c) => {
    const parsed = oauthAuthorizeInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "연결 요청이 올바르지 않습니다. 앱에서 다시 시작해주세요." }, 400);
    try {
      return c.json({ redirectTo: await mcpAccess.authorize(c.get("userId"), parsed.data) });
    } catch (err) {
      return oauthError(c, err);
    }
  });

function oauthError(c: Context, err: unknown) {
  if (err instanceof mcpAccess.OAuthError) {
    return c.json({ error: err.code, error_description: err.message }, 400);
  }
  console.error(`[oauth] ${err instanceof Error ? err.name : "Error"}`);
  return c.json({ error: "server_error" }, 500);
}
