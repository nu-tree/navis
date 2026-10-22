import { CORS_HEADERS, preflight } from "@/lib/oauth";
import { publicOrigin } from "@/lib/public-origin";

// 인가 서버 메타데이터(RFC 8414). 동의 화면은 web 의 /oauth/authorize, 등록 · 교환은 /api/oauth/*.
// 공개 클라이언트(비밀 없음) + PKCE S256 만 받는다 — Claude 가 쓰는 조합이다. 갱신 토큰은 없다(끊기 전까지 유효).
export function GET(request: Request) {
  const origin = publicOrigin(request);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: CORS_HEADERS },
  );
}

export const OPTIONS = preflight;
