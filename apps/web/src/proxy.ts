// 로그인 게이트 — 화면 전환만 담당한다.
//
// ★ 이름이 `proxy.ts` 인 것은 오타가 아니다. Next 16 부터 미들웨어가 Proxy 로
//   바뀌었다. `middleware.ts` 는 더 이상 쓰이지 않는다(헌장 규약).
//
// ★ 여기서 **인가를 판정하지 않는다.** Next 문서가 못 박는다 —
//   "Proxy is not intended for … a full session management or authorization
//   solution." 프리페치를 포함해 모든 라우트에서 돌기 때문이다.
//   실제 인가는 BFF 라우트 핸들러(lib/bff.ts)가 하고, 여기서는 쿠키를 보고
//   화면을 옮기는 낙관적 리다이렉트만 한다.
//
//   다만 Supabase 클라이언트는 여기서 한 번 만들어야 한다 — 그래야 만료된 토큰이
//   갱신되어 응답 쿠키에 실린다. 라이브러리 문서가 이걸 빠뜨리면
//   "random logouts, early session termination" 이 난다고 경고한다.
//   앱 데이터베이스는 건드리지 않으므로 Next 의 경고와 충돌하지 않는다.

import { NextResponse, type NextRequest } from "next/server";
import { serverClient, supabaseEnv } from "@/lib/supabase";

const LOGIN_PATH = "/login";

export async function proxy(request: NextRequest) {
  const env = supabaseEnv();
  // 설정이 없으면 로그인을 켜지 않은 로컬 개발 상태다. BFF 도 같은 판단을 한다.
  if (!env) return NextResponse.next();

  const response = NextResponse.next({ request });

  const supabase = serverClient(env, {
    getAll: () => request.cookies.getAll(),
    set: (name, value, options) => {
      // 갱신된 토큰을 응답에 실어야 브라우저가 다음 요청에 쓴다.
      response.cookies.set(name, value, options);
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = typeof data?.claims?.sub === "string";
  const onLoginPage = request.nextUrl.pathname === LOGIN_PATH;

  if (!signedIn && !onLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  if (signedIn && onLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // matcher 가 없으면 정적 파일·이미지까지 전부 지난다 — CSS·JS 가 리다이렉트에
  // 걸려 화면이 깨진다(Next 문서 경고).
  //
  // `/api/*` 도 제외한다. BFF 는 세션이 없을 때 **401 JSON** 을 돌려줘야 하는데,
  // 여기서 리다이렉트하면 fetch 호출자가 HTML 을 받아 파싱이 깨진다.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.png).*)"],
};
