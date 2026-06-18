// OAuth 흐름 전반에서 공유하는 내부 타입과 작은 유틸.
// 발견(discovery)·토큰 교환·pending 상태가 함께 쓰는 형태들을 한곳에 모은다.

// 발견된 인가서버 엔드포인트들.
export interface Discovered {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
}

// 토큰 엔드포인트 클라이언트 인증 방식 / 본문 인코딩.
export type ClientAuth = "basic" | "body" | "none";
export type BodyFormat = "form" | "json";

// 브라우저 동의 진행 중인 한 건의 상태(state → Pending).
export interface Pending {
  connectorId: string;
  label: string;
  mcpUrl: string;
  tokenEndpoint: string;
  clientId: string;
  // 공개 클라이언트(DCR token_endpoint_auth_method=none) 는 항상 undefined.
  // 토큰 응답이 우연히 client_secret 을 돌려줘도 여기엔 절대 들어가지 않는다.
  clientSecret?: string;
  clientAuth: ClientAuth;
  bodyFormat: BodyFormat;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

// 토큰 엔드포인트 응답(성공/오류 공용).
export interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// tokenRequest 가 성공 반환 시 보장하는 형태 — access_token 은 반드시 있다(없으면 throw).
// 호출부에서 `tok.access_token!` non-null 단언을 쓸 필요 없게 타입으로 좁힌다.
export interface TokenSuccess extends TokenResponse {
  access_token: string;
}

// base64url 인코딩(PKCE/state 생성용).
export const b64url = (b: Buffer): string =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// 콜백 주소 — baseUrl(요청에서 도출 또는 NAVIS_PUBLIC_URL) + 고정 경로.
export function callbackPath(): string {
  return "/api/connectors/oauth/callback";
}
