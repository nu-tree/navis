"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { browserClient, supabaseEnv } from "@/lib/supabase";

type SignInInput = { email: string; password: string };

/** 다른 사이트로 보내지 않는다 — next 는 이 앱 안의 경로만(열린 리다이렉트 방지, auth/confirm 과 같은 규칙). */
const safeNext = (raw: string | undefined) => (raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/");

/**
 * 이메일·비밀번호 로그인.
 *
 * ★ 브라우저의 Supabase 클라이언트는 **로그인·로그아웃에만** 쓴다. 기억·대화 데이터는
 *   전부 /api/* (BFF)를 지난다 — 브라우저가 DB 를 직접 읽기 시작하면 apps/server 가
 *   무의미해지고 행 수준 보안을 새로 설계해야 한다(헌장 원칙 II).
 */
export const useSignIn = (next?: string) => {
  const router = useRouter();

  return useMutation({
    mutationFn: async ({ email, password }: SignInInput) => {
      const env = supabaseEnv();
      if (!env) throw new Error("로그인이 설정되지 않았다.");

      const { error } = await browserClient(env)
        .auth.signInWithPassword({ email, password })
        .catch(() => {
          throw new Error("로그인 중 문제가 생겼습니다. 잠시 뒤 다시 시도해주세요.");
        });
      if (error) {
        // ★ 실패 사유를 그대로 보여주지 않는다. "user not found" 와
        //   "wrong password" 를 구분해 보여주면 어떤 이메일이 가입돼 있는지
        //   알려주는 셈이다(FR-045).
        throw new Error("이메일 또는 비밀번호가 맞지 않습니다.");
      }
    },
    onSuccess: () => {
      // replace 로 옮긴다 — 뒤로가기로 로그인 화면에 돌아오지 않게.
      // 가려던 화면이 있으면 그리로(예: Claude 연결 동의 화면). typedRoutes 가 모르는 문자열이라 단언한다.
      router.replace(safeNext(next) as "/");
      router.refresh();
    },
    // 실패 문구는 폼 안에 띄운다(토스트가 아니라) — 입력을 고치는 자리 바로 위에 있어야 한다.
  });
};
