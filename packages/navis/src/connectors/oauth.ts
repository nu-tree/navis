import { createHash, randomBytes } from "node:crypto";
import { getProvider } from "./providers.js";
import { upsertConnector } from "./store.js";
import type { Connector } from "./types.js";

// MCP-스펙 OAuth (메타데이터 발견 + Dynamic Client Registration + PKCE).
// Claude Desktop 이 사람 등록(client_id) 없이 "연결만 누르면" 되는 그 방식 그대로:
//   1. MCP 서버 URL 에서 보호리소스/인가서버 메타데이터를 자동 발견
//   2. DCR 로 client_id 를 런타임 자동 발급(없으면)
//   3. PKCE 인가코드 흐름으로 브라우저 1회 동의 → 토큰
//   4. refresh_token 으로 백엔드가 자동 갱신
//
// navis 역할 분담: 앱(브라우저 동의) + 백엔드(발견·등록·교환·저장·갱신). 헤드리스 백엔드는
// 최초 동의만 못 하므로 동의는 앱에서 받고 토큰 생애주기는 백엔드가 굴린다.

interface Discovered {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
}

interface Pending {
  connectorId: string;
  label: string;
  mcpUrl: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

const pending = new Map<string, Pending>();
const PENDING_TTL_MS = 10 * 60_000;

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > PENDING_TTL_MS) pending.delete(k);
}

const b64url = (b: Buffer): string =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// 콜백 주소 — baseUrl(요청에서 도출 또는 NAVIS_PUBLIC_URL) + 고정 경로.
export function callbackPath(): string {
  return "/api/connectors/oauth/callback";
}

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
async function discover(mcpUrl: string): Promise<Discovered> {
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
async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
): Promise<{ clientId: string; clientSecret?: string }> {
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
  return { clientId: data.client_id, clientSecret: data.client_secret };
}

// 동의 URL 생성 — 발견 + DCR 후 PKCE authorize URL 을 만든다. baseUrl 은 콜백을 구성할 공개 주소.
export async function startOAuth(
  providerKey: string,
  baseUrl: string,
): Promise<{ authUrl: string }> {
  const provider = getProvider(providerKey);
  if (!provider) throw new Error(`알 수 없는 제공자: ${providerKey}`);
  if (!baseUrl) throw new Error("공개 URL 을 알 수 없어 redirect_uri 를 만들 수 없습니다.");
  sweep();

  const redirectUri = `${baseUrl.replace(/\/+$/, "")}${callbackPath()}`;
  const disco = await discover(provider.mcpUrl);

  // client 자격 확보 — 하이브리드:
  //   ① 서버가 DCR 지원 → 런타임 자동 등록(Notion).
  //   ② 미지원이지만 등록된 client 자격 있음 → 그걸 사용(Google, config.google 재활용).
  //   ③ 둘 다 없음 → 명확한 에러.
  let clientId: string;
  let clientSecret: string | undefined;
  if (disco.registrationEndpoint) {
    ({ clientId, clientSecret } = await registerClient(disco.registrationEndpoint, redirectUri));
  } else if (provider.clientId) {
    clientId = provider.clientId;
    clientSecret = provider.clientSecret;
  } else {
    throw new Error(
      `${provider.label}: 인가서버가 DCR(자동 등록)을 지원하지 않고, 등록된 client_id 도 없어요. ` +
        `Google Cloud 등에서 OAuth 클라이언트를 만들고 redirect_uri 에 ${redirectUri} 를 등록한 뒤 자격을 설정하세요.`,
    );
  }

  const state = b64url(randomBytes(24));
  const codeVerifier = b64url(randomBytes(48));
  pending.set(state, {
    connectorId: provider.key,
    label: provider.label,
    mcpUrl: provider.mcpUrl,
    tokenEndpoint: disco.tokenEndpoint,
    clientId,
    clientSecret,
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: b64url(createHash("sha256").update(codeVerifier).digest()),
    code_challenge_method: "S256",
    // RFC 8707 — 이 토큰이 어느 MCP 서버용인지 명시(MCP 스펙 요구).
    resource: provider.mcpUrl,
  });
  // classic 제공자: 스코프 + 추가 파라미터(구글 refresh 확보용 access_type=offline 등).
  if (provider.scopes?.length) params.set("scope", provider.scopes.join(" "));
  for (const [k, v] of Object.entries(provider.extraAuthParams ?? {})) params.set(k, v);

  return { authUrl: `${disco.authorizationEndpoint}?${params.toString()}` };
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// 토큰 엔드포인트 호출(인가코드 교환/refresh 공용). 공개 클라이언트 → client_id 를 본문에, PKCE.
async function tokenRequest(
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string | undefined,
  fields: Record<string, string>,
): Promise<TokenResponse> {
  // 자격은 본문에 싣는다(form). 공개 클라이언트(DCR none)는 client_id 만, 기밀
  // 클라이언트(구글 웹앱)는 client_secret 까지. 구글·표준 OAuth2 토큰 엔드포인트 호환.
  const body: Record<string, string> = { client_id: clientId, ...fields };
  if (clientSecret) body.client_secret = clientSecret;
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(
      `토큰 교환 실패(${res.status}): ${data.error_description || data.error || "no access_token"}`,
    );
  }
  return data;
}

// 콜백 — code+state 로 토큰 교환 후 커넥터 저장(enabled). 갱신에 필요한 좌표도 함께 보관.
export async function completeOAuth(code: string, state: string): Promise<Connector> {
  const p = pending.get(state);
  if (!p) throw new Error("state 불일치/만료 — 다시 시도하세요.");
  pending.delete(state);

  const tok = await tokenRequest(p.tokenEndpoint, p.clientId, p.clientSecret, {
    grant_type: "authorization_code",
    code,
    redirect_uri: p.redirectUri,
    code_verifier: p.codeVerifier,
    resource: p.mcpUrl,
  });

  const connector: Connector = {
    id: p.connectorId,
    label: p.label,
    url: p.mcpUrl,
    enabled: true,
    alwaysLoad: true,
    auth: {
      type: "oauth",
      token: tok.access_token!,
      ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}),
      tokenUrl: p.tokenEndpoint,
      clientId: p.clientId,
      ...(p.clientSecret ? { clientSecret: p.clientSecret } : {}),
      resource: p.mcpUrl,
      clientAuth: "body",
      bodyFormat: "form",
      ...(tok.expires_in ? { expiresAt: Date.now() + tok.expires_in * 1000 } : {}),
    },
  };
  return upsertConnector(connector);
}

// refresh 실패 백오프 — "Grant not found" 처럼 영구 실패하는 토큰을 매 채팅 요청마다
// 다시 시도하면 토큰 엔드포인트 왕복(수백 ms~수 초)이 모든 응답 앞에 끼어든다.
// 실패한 커넥터는 일정 시간 재시도를 건너뛴다(성공하면 해제).
const refreshFailedAt = new Map<string, number>();
const REFRESH_BACKOFF_MS = 5 * 60_000;

// 사용 직전 — access token 만료 임박(60초 이내)이면 refresh 로 갱신·영속하고 갱신된 커넥터 반환.
export async function refreshIfNeeded(c: Connector): Promise<Connector> {
  if (c.auth.type !== "oauth") return c;
  const a = c.auth;
  if (!a.expiresAt || !a.refreshToken || !a.tokenUrl || !a.clientId) return c;
  if (Date.now() < a.expiresAt - 60_000) return c;

  const failedAt = refreshFailedAt.get(c.id);
  if (failedAt && Date.now() - failedAt < REFRESH_BACKOFF_MS) return c;

  try {
    const tok = await tokenRequest(a.tokenUrl, a.clientId, a.clientSecret, {
      grant_type: "refresh_token",
      refresh_token: a.refreshToken,
      ...(a.resource ? { resource: a.resource } : {}),
    });
    const updated: Connector = {
      ...c,
      auth: {
        ...a,
        token: tok.access_token!,
        ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}),
        ...(tok.expires_in ? { expiresAt: Date.now() + tok.expires_in * 1000 } : {}),
      },
    };
    refreshFailedAt.delete(c.id);
    return upsertConnector(updated);
  } catch (err) {
    refreshFailedAt.set(c.id, Date.now());
    console.error(`[connectors] ${c.id} 토큰 갱신 실패(기존 토큰으로 진행):`, err);
    return c;
  }
}
