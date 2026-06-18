// OAuth 흐름의 공개 진입점 — 동의 시작(startOAuth), 콜백 완료(completeOAuth),
// 사용 직전 토큰 선제 갱신(refreshIfNeeded). 발견·토큰·pending 모듈을 엮는 오케스트레이션.
//
// MCP-스펙 OAuth (메타데이터 발견 + Dynamic Client Registration + PKCE).
// Claude Desktop 이 사람 등록(client_id) 없이 "연결만 누르면" 되는 그 방식 그대로:
//   1. MCP 서버 URL 에서 보호리소스/인가서버 메타데이터를 자동 발견
//   2. DCR 로 client_id 를 런타임 자동 발급(없으면)
//   3. PKCE 인가코드 흐름으로 브라우저 1회 동의 → 토큰
//   4. refresh_token 으로 백엔드가 자동 갱신
//
// navis 역할 분담: 앱(브라우저 동의) + 백엔드(발견·등록·교환·저장·갱신). 헤드리스 백엔드는
// 최초 동의만 못 하므로 동의는 앱에서 받고 토큰 생애주기는 백엔드가 굴린다.

import { createHash, randomBytes } from "node:crypto";
import { getProvider } from "../providers.js";
import { invalidateConnectorsCache, isValidConnectorId, upsertConnector } from "../store.js";
import type { Connector } from "../types.js";
import { discover, registerClient } from "./discovery.js";
import { pending, sweep } from "./pending.js";
import { assertAuthorizationCode, TokenError, tokenRequest } from "./token.js";
import { b64url, callbackPath } from "./types.js";
import type { ClientAuth } from "./types.js";

// 동의 URL 생성 — 발견 + DCR 후 PKCE authorize URL 을 만든다. baseUrl 은 콜백을 구성할 공개 주소.
export async function startOAuth(
  providerKey: string,
  baseUrl: string,
): Promise<{ authUrl: string }> {
  const provider = getProvider(providerKey);
  if (!provider) throw new Error(`알 수 없는 제공자: ${providerKey}`);
  // preset.key 는 그대로 connector.id 가 되므로 슬러그 규칙/예약어 충돌을 먼저 검증한다.
  // 여기서 막지 않으면 브라우저 동의·토큰 교환을 마친 뒤 upsertConnector 의 normalize
  // 가 throw 해서 사용자가 받아놓은 access/refresh 토큰이 그대로 폐기된다.
  if (!isValidConnectorId(provider.key)) {
    throw new Error(
      `잘못된 제공자 키 "${provider.key}" — 커넥터 id 규칙(소문자/숫자/_, 예약어 제외)에 맞지 않습니다. providers.ts 의 preset 을 고치세요.`,
    );
  }
  if (!baseUrl) throw new Error("공개 URL 을 알 수 없어 redirect_uri 를 만들 수 없습니다.");
  sweep();

  const redirectUri = `${baseUrl.replace(/\/+$/, "")}${callbackPath()}`;
  const disco = await discover(provider.mcpUrl);

  // client 자격 확보 — 하이브리드:
  //   ① 서버가 DCR 지원 → 런타임 자동 등록(Notion). 공개 클라이언트 → clientAuth=none.
  //   ② 미지원이지만 등록된 client 자격 있음 → 그걸 사용(Google). 기밀 클라이언트 → body.
  //   ③ 둘 다 없음 → 명확한 에러.
  let clientId: string;
  let clientSecret: string | undefined;
  let clientAuth: ClientAuth;
  if (disco.registrationEndpoint) {
    ({ clientId } = await registerClient(disco.registrationEndpoint, redirectUri));
    clientSecret = undefined;
    clientAuth = "none";
  } else if (provider.clientId) {
    clientId = provider.clientId;
    clientSecret = provider.clientSecret;
    // classic 제공자에 secret 이 있으면 기밀 클라이언트(body 로 전송), 없으면 공개(none).
    clientAuth = clientSecret ? "body" : "none";
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
    ...(clientSecret ? { clientSecret } : {}),
    clientAuth,
    bodyFormat: "form",
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

// 콜백 — code+state 로 토큰 교환 후 커넥터 저장(enabled). 갱신에 필요한 좌표도 함께 보관.
export async function completeOAuth(code: string, state: string): Promise<Connector> {
  // 콜백은 사용자가 동의를 완료한 경로 — 다른 만료된 pending 항목도 함께 청소한다.
  sweep();
  assertAuthorizationCode(code);
  const p = pending.get(state);
  if (!p) throw new Error("state 불일치/만료 — 다시 시도하세요.");
  pending.delete(state);

  const tok = await tokenRequest(p.tokenEndpoint, p.clientId, p.clientSecret, p.clientAuth, p.bodyFormat, {
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
      token: tok.access_token,
      ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}),
      tokenUrl: p.tokenEndpoint,
      clientId: p.clientId,
      // 공개 클라이언트(clientAuth: "none") 는 절대 secret 을 영속하지 않는다 —
      // p.clientSecret 자체가 undefined 라 이 분기는 자동으로 빈 객체가 된다.
      ...(p.clientAuth !== "none" && p.clientSecret ? { clientSecret: p.clientSecret } : {}),
      resource: p.mcpUrl,
      clientAuth: p.clientAuth,
      bodyFormat: p.bodyFormat,
      ...(tok.expires_in ? { expiresAt: Date.now() + tok.expires_in * 1000 } : {}),
      // 새 토큰을 받았으므로 이전 영구 실패 플래그는 명시적으로 해제.
      needsReauth: false,
    },
  };
  return upsertConnector(connector);
}

// refresh 실패 백오프 — "Grant not found" 처럼 영구 실패하는 토큰을 매 채팅 요청마다
// 다시 시도하면 토큰 엔드포인트 왕복(수백 ms~수 초)이 모든 응답 앞에 끼어든다.
// 일시 네트워크 오류는 짧게 backoff, 영구 실패는 needsReauth 플래그로 사용자에게 신호.
const refreshFailedAt = new Map<string, number>();
const REFRESH_BACKOFF_MS = 5 * 60_000;

// 동시 refresh 합치기 — 같은 커넥터에 대해 동시에 들어오는 refresh 호출은 하나의 in-flight
// Promise 를 공유한다. refresh_token 을 회전(노션 등)하는 서버에서 두 요청이 동시에 들어가면
// 한쪽이 막 받은 새 refresh_token 을 다른 쪽이 옛 값으로 무효화시키는 race 가 발생한다.
const refreshInflight = new Map<string, Promise<Connector>>();

// 사용 직전 — access token 만료 임박(60초 이내)이면 refresh 로 갱신·영속하고 갱신된 커넥터 반환.
export async function refreshIfNeeded(c: Connector): Promise<Connector> {
  if (c.auth.type !== "oauth") return c;
  const a = c.auth;
  if (!a.expiresAt || !a.refreshToken || !a.tokenUrl || !a.clientId) return c;
  if (Date.now() < a.expiresAt - 60_000) return c;
  // 영구 실패로 재인증이 필요한 상태에서는 더 이상 자동 갱신 시도조차 하지 않는다 —
  // 사용자가 앱에서 다시 동의를 거치면 completeOAuth 가 플래그를 풀어준다.
  if (a.needsReauth) return c;

  const inflight = refreshInflight.get(c.id);
  if (inflight) return inflight;

  const failedAt = refreshFailedAt.get(c.id);
  if (failedAt && Date.now() - failedAt < REFRESH_BACKOFF_MS) return c;

  const promise = doRefresh(c).finally(() => {
    refreshInflight.delete(c.id);
  });
  refreshInflight.set(c.id, promise);
  return promise;
}

async function doRefresh(c: Connector): Promise<Connector> {
  if (c.auth.type !== "oauth") return c;
  const a = c.auth;
  if (!a.refreshToken || !a.tokenUrl || !a.clientId) return c;

  try {
    const tok = await tokenRequest(
      a.tokenUrl,
      a.clientId,
      // 공개 클라이언트는 정의상 secret 이 없어서 undefined — body 에도 안 실린다.
      a.clientAuth === "none" ? undefined : a.clientSecret,
      a.clientAuth ?? "body",
      a.bodyFormat ?? "form",
      {
        grant_type: "refresh_token",
        refresh_token: a.refreshToken,
        ...(a.resource ? { resource: a.resource } : {}),
      },
    );
    // expires_in 이 응답에 없으면 a.expiresAt 이 과거 시각 그대로 남아 다음 refreshIfNeeded
     // 호출이 즉시 또 갱신을 시도하는 루프 위험이 있다. 명세상 일반 access token 수명에
     // 가까운 1시간을 기본값으로 박아 새 expiresAt 을 세팅한다.
    let expiresAt: number | undefined;
    if (tok.expires_in) {
      expiresAt = Date.now() + tok.expires_in * 1000;
    } else {
      expiresAt = Date.now() + 3600 * 1000;
      console.warn(
        `[connectors] ${c.id} 토큰 응답에 expires_in 누락 — 기본 1시간으로 expiresAt 설정`,
      );
    }
    const updated: Connector = {
      ...c,
      auth: {
        ...a,
        token: tok.access_token,
        ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}),
        expiresAt,
        needsReauth: false,
      },
    };
    refreshFailedAt.delete(c.id);
    const saved = await upsertConnector(updated);
    // 캐시(listConnectors TTL 30s) 안에 옛 refreshToken 이 남아 있으면 직후 동시 요청이
    // 옛 토큰으로 다시 refresh 를 시도해 회전형 서버(노션 등)에서 옛 토큰이 무효화되며
    // invalid_grant → needsReauth 영구 실패로 갈 수 있다. 저장 성공 직후 캐시를 강제로
    // 비워 다음 조회가 새 refreshToken 을 읽도록 보장한다.
    invalidateConnectorsCache();
    return saved;
  } catch (err) {
    if (err instanceof TokenError && err.permanent) {
      // 영구 실패 — 다음 턴부터 자동 제외되고, 앱 UI 에 재인증 배지를 띄울 수 있도록 영속.
      console.error(
        `[connectors] ${c.id} 영구 토큰 실패(재인증 필요): ${err.message}`,
      );
      try {
        return await upsertConnector({ ...c, auth: { ...a, needsReauth: true } });
      } catch (saveErr) {
        console.error(`[connectors] ${c.id} 재인증 플래그 저장 실패:`, saveErr);
        return c;
      }
    }
    // 일시 실패(네트워크/5xx/타임아웃) — 짧은 backoff 후 다시 시도.
    refreshFailedAt.set(c.id, Date.now());
    console.error(`[connectors] ${c.id} 토큰 갱신 실패(기존 토큰으로 진행):`, err);
    return c;
  }
}
