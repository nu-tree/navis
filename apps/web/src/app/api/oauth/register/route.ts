import { preflight, relayAnonymous } from "@/lib/oauth";

// 동적 클라이언트 등록(RFC 7591). Claude 가 연결을 시작할 때 부른다 — 등록만으로는 아무것도 열리지 않는다.
export const POST = (request: Request) => relayAnonymous(request, "/oauth/register");
export const OPTIONS = preflight;
