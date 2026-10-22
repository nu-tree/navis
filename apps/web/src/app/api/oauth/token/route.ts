import { preflight, relayAnonymous } from "@/lib/oauth";

// 코드 → 토큰. 본문(form-urlencoded)은 읽지 않고 그대로 넘긴다 — 판정은 server 가 한다.
export const POST = (request: Request) => relayAnonymous(request, "/oauth/token");
export const OPTIONS = preflight;
