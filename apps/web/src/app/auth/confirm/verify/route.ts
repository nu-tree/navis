import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { serverClient, supabaseEnv } from "@/lib/supabase";

// 메일 링크의 일회용 토큰을 실제로 쓰는 곳 — /auth/confirm 화면의 "계속하기" 버튼이 POST 로 보낸다.
//
// ★ 링크를 여는 것(GET)만으로 토큰을 쓰지 않는다(2026-11-13). 메일 서비스 · 메신저의 링크 검사기가 메일이
//   도착하자마자 링크를 미리 열어 보는데, GET 에서 검증하면 그때 토큰이 소모돼 회원이 처음 누를 때 이미
//   "만료"였다. 검사기는 폼을 제출하지 않으므로, 사람이 버튼을 눌러야만 토큰이 쓰인다.
//
// ★ 기본 템플릿의 {{ .ConfirmationURL }} 은 로그인 정보를 주소의 `#` 뒤에 실어 서버가 받을 수 없다.
//   그래서 템플릿은 {{ .TokenHash }} 를 넘기는 /auth/confirm 주소를 쓴다(deploy/README.md "메일 템플릿").

const TYPES: readonly EmailOtpType[] = ["invite", "recovery", "signup", "magiclink", "email", "email_change"];

/** 다른 사이트로 보내지 않는다 — next 는 이 앱 안의 경로만(열린 리다이렉트 방지). */
const safeNext = (raw: unknown) =>
  typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

/**
 * 상대경로로 보내는 리다이렉트. 303 — POST 다음 화면은 GET 으로 연다.
 *
 * ★ 절대 URL 을 만들지 않는다. Cloud Run 에서 Next standalone 은 0.0.0.0:8080 으로 떠서 request.url 이
 *   내부 주소를 가리킨다(2026-10-08). 상대경로 Location 은 브라우저가 지금 주소를 기준으로 푼다(RFC 9110).
 */
const redirectTo = (path: string) =>
  new NextResponse(null, { status: 303, headers: { Location: path } });

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const tokenHash = form?.get("token_hash");
  const type = form?.get("type") as EmailOtpType | null;
  const env = supabaseEnv();

  const fail = () => redirectTo("/login?error=link");
  if (!env || typeof tokenHash !== "string" || !tokenHash || !type || !TYPES.includes(type)) return fail();

  const response = redirectTo(safeNext(form?.get("next")));

  // 세션 쿠키를 이 리다이렉트 응답에 싣는다 — 다음 화면(비밀번호 정하기)이 로그인된 상태로 열린다.
  const supabase = serverClient(env, {
    getAll: () => request.cookies.getAll(),
    set: (name, value, options) => response.cookies.set(name, value, options),
  });
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (!error) return response;

  // 이미 쓴 링크라도 그 브라우저에 세션이 살아 있으면 그대로 들여보낸다 — 버튼을 두 번 눌렀거나,
  // 비밀번호를 정하다 창을 닫고 메일 링크를 다시 연 경우.
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub === "string") return response;

  // 만료됐거나 이미 쓴 링크다. 사유는 화면에 그대로 보여주지 않는다.
  return fail();
}
