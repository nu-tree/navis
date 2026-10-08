import { proxyToServer } from "@/lib/bff";

// 이름 바꾸기 = 합치기. to 가 이미 있으면 merged: true 로 돌아온다.
export const POST = (request: Request) => proxyToServer(request, { path: "/memories/projects/rename" });
