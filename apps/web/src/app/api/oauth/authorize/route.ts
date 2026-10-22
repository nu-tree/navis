import { proxyToServer } from "@/lib/bff";

// 동의 화면의 "허용". 회원은 세션이 정한다(BFF) — 코드가 이 회원에게 묶인다.
export const POST = (request: Request) => proxyToServer(request, { path: "/oauth/authorize" });
