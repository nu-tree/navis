import { handleOAuthCallback } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 제공자가 동의 후 브라우저를 여기로 되돌려보낸다 → HTML 응답.
// state 로 진행 중 인가를 찾으므로 앱 토큰 인증이 없다(state 가 CSRF 방어).
// 이 라우트는 [id] 보다 구체적인 경로라 Next.js 파일 라우터가 먼저 매칭한다 —
// 예전 자체 라우터에서 순서로 보장하던 우선순위가 파일 구조로 자연히 성립.
export const GET = (req: Request) => handleOAuthCallback(req);
