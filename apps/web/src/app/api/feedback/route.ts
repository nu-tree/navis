import { proxyToServer } from "@/lib/bff";

// 피드백 — 관리자 전용. 판단하지 않고 넘긴다. 관리자가 아니면 server 가 403 으로 막는다.
export const GET = (request: Request) => proxyToServer(request, { path: "/feedback" });
