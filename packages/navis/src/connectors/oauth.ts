import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { getProvider, type OAuthProvider } from "./providers.js";
import { upsertConnector } from "./store.js";
import type { Connector } from "./types.js";

// 커넥터 OAuth 흐름(인가코드 + PKCE). 데스크탑이 한 앱에 뭉쳐둔 걸 navis 는 앱(브라우저
// 동의) + 백엔드(코드 교환·토큰 저장·자동 갱신)로 나눠 갖는다.
//   start    : 앱이 authed 로 호출 → 동의 URL 생성(브라우저로 엶)
//   callback : 제공자가 code 와 함께 백엔드로 리다이렉트 → 토큰 교환 → 커넥터 저장
//   refresh  : 사용 직전 만료 임박 시 refresh_token 으로 access token 선제 갱신

// 진행 중 인가의 일회성 상태(state→{verifier,...}). 단일 인스턴스 인메모리 + TTL.
interface Pending {
  provider: OAuthProvider;
  connectorId: string;
  label: string;
  codeVerifier: string;
  createdAt: number;
}
const pending = new Map<string, Pending>();
const PENDING_TTL_MS = 10 * 60_000;

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (now - v.createdAt > PENDING_TTL_MS) pending.delete(k);
  }
}

const b64url = (b: Buffer): string =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// 콜백 주소 — 제공자에 등록한 redirect_uri 와 정확히 일치해야 한다.
export function redirectUri(): string {
  if (!config.publicUrl) {
    throw new Error("NAVIS_PUBLIC_URL 미설정 — OAuth redirect_uri 를 만들 수 없습니다.");
  }
  return `${config.publicUrl}/api/connectors/oauth/callback`;
}

// 동의 URL 생성. 반환한 authUrl 을 앱이 브라우저로 연다.
export function startOAuth(providerKey: string): { authUrl: string } {
  const provider = getProvider(providerKey);
  if (!provider) throw new Error(`알 수 없는 제공자: ${providerKey}`);
  if (!provider.clientId) {
    throw new Error(`${provider.label} OAuth 미구성 — ${providerKey.toUpperCase()}_OAUTH_CLIENT_ID 필요`);
  }
  sweep();

  const state = b64url(randomBytes(24));
  const codeVerifier = b64url(randomBytes(48));
  pending.set(state, {
    provider,
    connectorId: provider.key,
    label: provider.label,
    codeVerifier,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: provider.clientId,
    redirect_uri: redirectUri(),
    state,
    ...(provider.scopes.length ? { scope: provider.scopes.join(" ") } : {}),
    ...(provider.extraAuthParams ?? {}),
  });
  if (provider.usePkce) {
    params.set("code_challenge", b64url(createHash("sha256").update(codeVerifier).digest()));
    params.set("code_challenge_method", "S256");
  }
  return { authUrl: `${provider.authorizeUrl}?${params.toString()}` };
}

// 토큰 엔드포인트 응답.
interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// 토큰 엔드포인트 호출 공통(인가코드 교환 / refresh 공용). provider 의 clientAuth/bodyFormat 을 따른다.
async function tokenRequest(
  p: Pick<OAuthProvider, "tokenUrl" | "clientId" | "clientSecret" | "clientAuth" | "bodyFormat">,
  fields: Record<string, string>,
): Promise<TokenResponse> {
  const headers: Record<string, string> = {};
  const body: Record<string, string> = { ...fields };

  if (p.clientAuth === "basic" && p.clientId) {
    const basic = Buffer.from(`${p.clientId}:${p.clientSecret ?? ""}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  } else {
    if (p.clientId) body.client_id = p.clientId;
    if (p.clientSecret) body.client_secret = p.clientSecret;
  }

  let payload: string;
  if (p.bodyFormat === "json") {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(body).toString();
  }

  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers,
    body: payload,
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

// 콜백 — code+state 로 토큰 교환 후 커넥터를 저장(enabled). 성공 시 저장된 커넥터 반환.
export async function completeOAuth(code: string, state: string): Promise<Connector> {
  const p = pending.get(state);
  if (!p) throw new Error("state 불일치/만료 — 다시 시도하세요.");
  pending.delete(state);
  const { provider } = p;

  const tok = await tokenRequest(provider, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    ...(provider.usePkce ? { code_verifier: p.codeVerifier } : {}),
  });

  const connector: Connector = {
    id: p.connectorId,
    label: p.label,
    url: provider.mcpUrl,
    enabled: true,
    alwaysLoad: true,
    auth: {
      type: "oauth",
      token: tok.access_token!,
      ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}),
      tokenUrl: provider.tokenUrl,
      ...(provider.clientId ? { clientId: provider.clientId } : {}),
      ...(provider.clientSecret ? { clientSecret: provider.clientSecret } : {}),
      clientAuth: provider.clientAuth,
      bodyFormat: provider.bodyFormat,
      ...(tok.expires_in ? { expiresAt: Date.now() + tok.expires_in * 1000 } : {}),
    },
  };
  return upsertConnector(connector);
}

// 사용 직전 호출 — oauth 커넥터의 access token 이 만료 임박(60초 이내)이면 refresh 로 갱신하고
// DB 에 영속한 뒤 갱신된 커넥터를 반환. 갱신 불필요/불가면 원본 그대로 반환(실패는 401 로 드러남).
export async function refreshIfNeeded(c: Connector): Promise<Connector> {
  if (c.auth.type !== "oauth") return c;
  const a = c.auth;
  if (!a.expiresAt || !a.refreshToken || !a.tokenUrl) return c;
  if (Date.now() < a.expiresAt - 60_000) return c; // 아직 여유

  try {
    const tok = await tokenRequest(
      {
        tokenUrl: a.tokenUrl,
        clientId: a.clientId,
        clientSecret: a.clientSecret,
        clientAuth: a.clientAuth ?? "body",
        bodyFormat: a.bodyFormat ?? "form",
      },
      { grant_type: "refresh_token", refresh_token: a.refreshToken },
    );
    const updated: Connector = {
      ...c,
      auth: {
        ...a,
        token: tok.access_token!,
        // refresh_token 로테이션 대응(새로 오면 교체, 아니면 유지).
        ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}),
        ...(tok.expires_in ? { expiresAt: Date.now() + tok.expires_in * 1000 } : {}),
      },
    };
    return upsertConnector(updated);
  } catch (err) {
    console.error(`[connectors] ${c.id} 토큰 갱신 실패(기존 토큰으로 진행):`, err);
    return c;
  }
}
