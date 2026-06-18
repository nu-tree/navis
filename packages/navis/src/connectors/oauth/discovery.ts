// OAuth 메타데이터 발견(RFC 9728/8414) + Dynamic Client Registration(RFC 7591).
// MCP 서버 URL 만으로 인가/토큰 엔드포인트를 자동 발견하고, 필요 시 client_id 를 런타임 발급한다.

import type { Discovered } from "./types.js";

// 주어진 URL 들을 순서대로 시도해 첫 유효 JSON 을 반환(메타데이터 발견용).
async function tryJson(urls: string[]): Promise<Record<string, unknown> | undefined> {
  for (const u of urls) {
    try {
      const res = await fetch(u, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return (await res.json()) as Record<string, unknown>;
    } catch {
      /* 다음 후보 */
    }
  }
  return undefined;
}

// MCP 서버 URL 에서 인가서버 메타데이터를 발견(RFC 9728 보호리소스 → RFC 8414 인가서버).
export async function discover(mcpUrl: string): Promise<Discovered> {
  const u = new URL(mcpUrl);
  const path = u.pathname.replace(/\/$/, "");

  // 1) 보호 리소스 메타데이터 → authorization_servers
  const prm = await tryJson([
    `${u.origin}/.well-known/oauth-protected-resource${path}`,
    `${u.origin}/.well-known/oauth-protected-resource`,
  ]);
  const asList = Array.isArray(prm?.authorization_servers)
    ? (prm!.authorization_servers as string[])
    : [];
  const asBase = asList[0] ?? u.origin;

  // 2) 인가서버 메타데이터(oauth-authorization-server 우선, openid-configuration 폴백).
  const asUrl = new URL(asBase);
  const asPath = asUrl.pathname.replace(/\/$/, "");
  const asm = await tryJson([
    `${asUrl.origin}/.well-known/oauth-authorization-server${asPath}`,
    `${asUrl.origin}/.well-known/oauth-authorization-server`,
    `${asUrl.origin}/.well-known/openid-configuration${asPath}`,
    `${asUrl.origin}/.well-known/openid-configuration`,
  ]);
  const authorizationEndpoint = typeof asm?.authorization_endpoint === "string" ? asm.authorization_endpoint : "";
  const tokenEndpoint = typeof asm?.token_endpoint === "string" ? asm.token_endpoint : "";
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error(`${u.host} 인가서버 메타데이터를 찾지 못했어요(OAuth 미지원이거나 발견 실패).`);
  }
  return {
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint:
      typeof asm?.registration_endpoint === "string" ? asm.registration_endpoint : undefined,
  };
}

// Dynamic Client Registration(RFC 7591) — client_id 런타임 자동 발급(공개 클라이언트+PKCE).
// 서버가 응답에 client_secret 을 끼워 돌려줘도(스펙상 "none" 일 때 의미 없음) 절대 받아쓰지
// 않는다 — 공개 클라이언트가 비밀값을 들고 있으면 그 자체로 위협 모델 위반.
export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
): Promise<{ clientId: string }> {
  const res = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "navis",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // 공개 클라이언트 + PKCE
      application_type: "web",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    client_id?: string;
    client_secret?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.client_id) {
    throw new Error(
      `클라이언트 등록 실패(${res.status}): ${data.error_description || data.error || "no client_id"}`,
    );
  }
  return { clientId: data.client_id };
}
