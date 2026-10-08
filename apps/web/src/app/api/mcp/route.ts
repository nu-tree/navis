import { apiServer } from "@/lib/api-server";

// 외부 MCP 중계. Claude Code → (여기) → apps/server /mcp.
//
// ★ 여기는 BFF 가 아니다. 로그인 세션을 보지 않고, web 이 쥔 NAVIS_API_TOKEN 도 붙이지
//   않는다. 클라이언트가 보낸 Authorization(MCP 토큰)을 **그대로** 넘기고 검증은 server 가
//   한다 — web 은 MCP 토큰을 알 필요가 없다(헌장 보안 절).
//
// server 를 인터넷에 직접 열지 않으려고 둔 통로다. 본문은 파싱하지 않고 흘려보낸다.

// MCP Streamable HTTP 가 쓰는 헤더만 넘긴다. 쿠키 같은 브라우저 자격은 넘기지 않는다.
const FORWARD_REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "mcp-session-id",
  "mcp-protocol-version",
  "last-event-id",
];
const FORWARD_RESPONSE_HEADERS = ["content-type", "mcp-session-id", "www-authenticate", "allow"];

async function relay(request: Request): Promise<Response> {
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetch(`${apiServer.baseUrl}/mcp`, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    signal: request.signal,
  });

  const responseHeaders = new Headers({ "cache-control": "no-store" });
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = relay;
export const POST = relay;
export const DELETE = relay;
