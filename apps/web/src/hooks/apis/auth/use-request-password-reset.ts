"use client";

import { useMutation } from "@tanstack/react-query";
import { browserClient, supabaseEnv } from "@/lib/supabase";

/**
 * 비밀번호 재설정 메일 요청.
 *
 * ★ 가입된 이메일인지 알려주지 않는다 — 없는 이메일에도 "보냈어요"로 답한다. 구분하면 어떤 이메일이
 *   회원인지 알아내는 데 쓰인다(로그인 실패 문구와 같은 이유, FR-045).
 */
export const useRequestPasswordReset = () => {
  return useMutation({
    mutationFn: async (email: string) => {
      const env = supabaseEnv();
      if (!env) throw new Error("로그인이 설정되지 않았다.");
      const { error } = await browserClient(env).auth.resetPasswordForEmail(email.trim(), {
        // 메일 템플릿이 {{ .RedirectTo }} 를 쓰지 않아도 되게, 기본 경로는 템플릿에 박혀 있다.
        redirectTo: `${window.location.origin}/auth/set-password`,
      });
      // 너무 자주 요청한 경우만 알린다. 그 밖의 실패도 "보냈어요"로 둔다(위 주석).
      if (error?.status === 429) throw new Error("잠시 뒤에 다시 요청해 주세요.");
    },
  });
};
