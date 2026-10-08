import { proxyToServer } from "@/lib/bff";

// 진행 중인 턴 중지. 같은 회원의 턴만 멈춘다 — 회원은 proxyToServer 가 세션에서 붙인다.
export const POST = (request: Request) => proxyToServer(request, { path: "/chat/cancel" });
