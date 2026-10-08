import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { serverClient, supabaseEnv } from "@/lib/supabase";

// 메일 링크가 도착하는 곳 — 초대 · 비밀번호 재설정(Supabase 메일 템플릿이 이 주소를 가리킨다).
//
// ★ 기본 템플릿의 {{ .ConfirmationURL }} 은 로그인 정보를 주소의 `#` 뒤에 실어 보낸다. 그 부분은
//   브라우저에만 있고 서버로 오지 않아, 쿠키로 세션을 두는 이 앱(@supabase/ssr)은 받을 수 없다.
//   그래서 템플릿을 {{ .TokenHash }} 를 넘기는 이 주소로 바꾸고, 여기서 서버가 검증해 세션 쿠키를
//   심는다(deploy/README.md "메일 템플릿").
//
//   /auth/confirm?token_hash=…&type=invite|recovery&next=/auth/set-password

const TYPES: readonly EmailOtpType[] = ["invite", "recovery", "signup", "magiclink", "email", "email_change"];

/** 다른 사이트로 보내지 않는다 — next 는 이 앱 안의 경로만(열린 리다이렉트 방지). */
const safeNext = (raw: string | null) => (raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/");

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const env = supabaseEnv();

  const fail = () => {
    const to = url.clone();
    to.pathname = "/login";
    to.search = "?error=link";
    return NextResponse.redirect(to);
  };
  if (!env || !tokenHash || !type || !TYPES.includes(type)) return fail();

  const to = url.clone();
  to.pathname = safeNext(url.searchParams.get("next"));
  to.search = "";
  const response = NextResponse.redirect(to);

  // 세션 쿠키를 이 리다이렉트 응답에 싣는다 — 다음 화면(비밀번호 정하기)이 로그인된 상태로 열린다.
  const supabase = serverClient(env, {
    getAll: () => request.cookies.getAll(),
    set: (name, value, options) => response.cookies.set(name, value, options),
  });
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  // 만료됐거나 이미 쓴 링크다. 사유는 화면에 그대로 보여주지 않는다.
  if (error) return fail();

  return response;
}
