import { proxyToServer } from "@/lib/bff";

// 요청 회원이 관리자인지. 관리자만 보이는 버튼(기억 지우기)을 가른다 — 실제 잠금은 server 가 한다.
export const GET = (request: Request) => proxyToServer(request, { path: "/me" });
