import { proxyToServer } from "@/lib/bff";

// Claude 구독 토큰(US5). 본문은 그대로 서버로 흘린다 — 여기서 읽거나 로그에 남기지 않는다(FR-037).
const path = "/settings/claude-token";

export const GET = (request: Request) => proxyToServer(request, { path });
export const PUT = (request: Request) => proxyToServer(request, { path });
export const DELETE = (request: Request) => proxyToServer(request, { path });
