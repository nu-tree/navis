import { z } from "zod";

// 외부 MCP 연결(specs/002 FR-113 개정) — 회원이 자기 나비스를 Claude Code · claude.ai · 데스크톱에 붙인다.
//
// 연결 하나 = 토큰 하나. 화면에는 이름 · 언제 만들었고 언제 마지막으로 썼는지만 오간다 — 토큰 원문은
// **직접 발급 응답에 한 번만** 실린다(McpTokenIssued).

export const mcpConnectionSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  /** oauth = Claude 가 로그인으로 받아 간 연결, token = 회원이 직접 발급해 붙여 넣은 연결. */
  kind: z.enum(["oauth", "token"]),
  createdAt: z.string(), // ISO 8601
  lastUsedAt: z.string().nullable(),
});
export type McpConnection = z.infer<typeof mcpConnectionSchema>;

export const mcpConnectionListSchema = z.object({ items: z.array(mcpConnectionSchema) });
export type McpConnectionList = z.infer<typeof mcpConnectionListSchema>;

export const mcpTokenInputSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
});
export type McpTokenInput = z.infer<typeof mcpTokenInputSchema>;

/** 직접 발급 응답 — 원문이 실리는 유일한 자리. 다시 볼 수 없다. */
export const mcpTokenIssuedSchema = z.object({
  token: z.string(),
  connection: mcpConnectionSchema,
});
export type McpTokenIssued = z.infer<typeof mcpTokenIssuedSchema>;

// ── OAuth(MCP 규격의 인가) ───────────────────────────────────────────────
// 필드 이름은 OAuth 규격(snake_case) 그대로다 — Claude 가 보내는 모양을 바꿀 수 없다.

/** 동적 클라이언트 등록(RFC 7591). 우리가 쓰는 필드만 본다. */
export const oauthClientRegistrationSchema = z.object({
  client_name: z.string().trim().max(100).optional(),
  redirect_uris: z.array(z.url().max(2048)).min(1).max(10),
});
export type OAuthClientRegistration = z.infer<typeof oauthClientRegistrationSchema>;

/** 동의 화면이 보여줄 클라이언트. redirect 주소의 호스트를 함께 보여 어디로 가는지 알게 한다. */
export const oauthClientInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  redirectHosts: z.array(z.string()),
});
export type OAuthClientInfo = z.infer<typeof oauthClientInfoSchema>;

/** 동의 화면의 "허용". 인가 요청 쿼리를 그대로 옮긴다. */
export const oauthAuthorizeInputSchema = z.object({
  client_id: z.string().min(1).max(200),
  redirect_uri: z.url().max(2048),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  state: z.string().max(2048).optional(),
});
export type OAuthAuthorizeInput = z.infer<typeof oauthAuthorizeInputSchema>;

export const oauthAuthorizeResultSchema = z.object({ redirectTo: z.url() });
export type OAuthAuthorizeResult = z.infer<typeof oauthAuthorizeResultSchema>;

/** 토큰 교환(authorization_code + PKCE). */
export const oauthTokenInputSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1).max(200),
  redirect_uri: z.url().max(2048),
  client_id: z.string().min(1).max(200),
  code_verifier: z.string().min(43).max(128),
});
export type OAuthTokenInput = z.infer<typeof oauthTokenInputSchema>;
