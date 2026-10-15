import { proxyToServer } from "@/lib/bff";

// 전하기 — 관리자 전용. 판단하지 않고 넘긴다. 관리자가 아니면 server 가 403 으로 막는다(specs/004).
export const GET = (request: Request) => proxyToServer(request, { path: "/relays" });
export const POST = (request: Request) => proxyToServer(request, { path: "/relays" });
