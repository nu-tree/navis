import { proxyToServer } from "@/lib/bff";

// 받는 사람 목록 — 관리자 전용(server 가 403 으로 막는다, specs/004).
export const GET = (request: Request) => proxyToServer(request, { path: "/relays/members" });
