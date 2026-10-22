import { CORS_HEADERS, preflight } from "@/lib/oauth";
import { mcpUrl, publicOrigin } from "@/lib/public-origin";

// 보호된 리소스 메타데이터(RFC 9728). /api/mcp 가 401 을 주면 Claude 가 여기를 읽고 인가 서버를 찾는다.
// 규격은 리소스 경로를 뒤에 붙인 주소(/.well-known/oauth-protected-resource/api/mcp)를 먼저 보므로 둘 다 받는다.
export function GET(request: Request) {
  const origin = publicOrigin(request);
  return Response.json(
    {
      resource: mcpUrl(origin),
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      resource_name: "나비스",
    },
    { headers: CORS_HEADERS },
  );
}

export const OPTIONS = preflight;
