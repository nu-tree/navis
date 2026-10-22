// MCP 인가(OAuth) 중계 공용. 메타데이터 · 등록 · 교환은 Claude 가 부르므로 로그인 세션이 없다 —
// web 이 쥔 API_TOKEN 만 붙여 server 로 넘긴다(회원 헤더 없음). 회원이 정해지는 건 동의 화면뿐이다.

import { apiServer, missingApiConfig } from "@/lib/api-server";

/** 브라우저 기반 MCP 클라이언트(검사 도구 등)도 읽게 연다. 쿠키를 쓰지 않으니 * 로 충분하다. */
export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

/** 본문을 그대로 server 로 넘기고 그대로 돌려준다. 실패 본문도 OAuth 모양 그대로다. */
export async function relayAnonymous(request: Request, path: string): Promise<Response> {
  const missing = missingApiConfig();
  if (missing) return Response.json({ error: "server_error" }, { status: 500, headers: CORS_HEADERS });

  const upstream = await fetch(`${apiServer.baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiServer.token}`,
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
    body: await request.text(),
  }).catch(() => null);
  if (!upstream) return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: CORS_HEADERS });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS_HEADERS,
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
