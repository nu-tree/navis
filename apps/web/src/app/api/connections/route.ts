import { proxyToServer } from "@/lib/bff";

// 외부 MCP 연결 목록 · 직접 발급. 발급 응답에만 토큰 원문이 있다 — 여기서 읽거나 남기지 않는다.
const path = "/connections";

export const GET = (request: Request) => proxyToServer(request, { path });
export const POST = (request: Request) => proxyToServer(request, { path });
