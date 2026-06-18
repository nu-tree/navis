// 토큰 엔드포인트 호출과 오류 분류, authorization code 검증.
// 인가코드 교환과 refresh 가 공유하는 저수준 HTTP 로직을 담는다.

import type { BodyFormat, ClientAuth, TokenResponse, TokenSuccess } from "./types.js";

// 토큰 엔드포인트 응답 오류를 영구/일시로 분류해 던지는 전용 에러 — refreshIfNeeded 가
// 이 정보로 "재인증 필요" 신호를 결정한다.
export class TokenError extends Error {
  constructor(
    public readonly permanent: boolean,
    public readonly oauthError: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

// RFC 6749 §5.2 영구 실패 코드 — refresh_token 이 무효해진 상태.
const PERMANENT_OAUTH_ERRORS = new Set([
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
  "unsupported_grant_type",
]);

function classifyTokenError(
  status: number,
  data: TokenResponse,
): { permanent: boolean; message: string } {
  const err = data.error;
  const desc = data.error_description;
  const text = desc || err || `HTTP ${status}`;
  if (err && PERMANENT_OAUTH_ERRORS.has(err)) return { permanent: true, message: text };
  // 일부 제공자(노션 포함) 는 error 코드 없이 description 에 사유를 넣는다.
  if (desc && /grant\s+not\s+found|revoked|expired|reauth/i.test(desc)) {
    return { permanent: true, message: text };
  }
  return { permanent: false, message: text };
}

// 토큰 엔드포인트 호출(인가코드 교환/refresh 공용).
// clientAuth/bodyFormat 를 honor 한다:
//   - basic: Authorization: Basic base64(id:secret), 본문에는 client_id 미동봉
//   - body : 본문에 client_id + client_secret(있으면)
//   - none : 본문에 client_id 만 — 공개 클라이언트(PKCE), client_secret 자체가 없음
//   - bodyFormat=json: application/json, 그 외엔 form-urlencoded
export async function tokenRequest(
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string | undefined,
  clientAuth: ClientAuth,
  bodyFormat: BodyFormat,
  fields: Record<string, string>,
): Promise<TokenSuccess> {
  const body: Record<string, string> = { ...fields };
  const headers: Record<string, string> = { accept: "application/json" };

  if (clientAuth === "basic") {
    if (!clientSecret) {
      throw new TokenError(
        true,
        undefined,
        "clientAuth=basic 이지만 clientSecret 이 없습니다 — 설정 불일치",
      );
    }
    headers["authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    // body / none 둘 다 client_id 는 본문에. secret 은 기밀 클라이언트(body) 에서만.
    body.client_id = clientId;
    if (clientAuth === "body" && clientSecret) body.client_secret = clientSecret;
  }

  let payload: string;
  if (bodyFormat === "json") {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(body).toString();
  }

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers,
    body: payload,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    const { permanent, message } = classifyTokenError(res.status, data);
    throw new TokenError(permanent, data.error, `토큰 교환 실패(${res.status}): ${message}`);
  }
  // 위 가드(!data.access_token) 가 통과했으므로 access_token 은 string. TS 가 좁히지
  // 못하는 부분만 한 줄 분리해 단언 대신 명시적 const 로 확정한다.
  const accessToken: string = data.access_token;
  return { ...data, access_token: accessToken };
}

// OAuth authorization code 길이/문자셋 sanity check. RFC 6749 는 code 형식을 명시하지
// 않지만 실제 제공자들은 모두 짧은(<1KB) URL-safe ASCII 문자열을 돌려준다. 콜백 쿼리에
// 임의 입력이 끼어 token endpoint 로 그대로 흘러가는 것을 막는 최소 방어선.
const CODE_RE = /^[A-Za-z0-9._~+\/=:\-]+$/;
export function assertAuthorizationCode(code: string): void {
  if (typeof code !== "string" || !code) {
    throw new Error("authorization code 가 비어 있어요.");
  }
  if (code.length > 2048) {
    throw new Error("authorization code 가 너무 깁니다.");
  }
  if (!CODE_RE.test(code)) {
    throw new Error("authorization code 에 허용되지 않은 문자가 있습니다.");
  }
}
