"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient, supabaseEnv } from "@/lib/supabase";

/**
 * 로그인·로그아웃.
 *
 * ★ 브라우저의 Supabase 클라이언트는 **이 두 가지에만** 쓴다. 기억·대화 데이터는
 *   전부 /api/* (BFF)를 지난다 — 브라우저가 DB 를 직접 읽기 시작하면 apps/server 가
 *   무의미해지고 행 수준 보안을 새로 설계해야 한다(헌장 원칙 II).
 */
export function useAuth() {
  const router = useRouter();
  const env = useMemo(() => supabaseEnv(), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!env) {
        setError("로그인이 설정되지 않았다.");
        return false;
      }
      setPending(true);
      setError(null);
      try {
        const { error } = await browserClient(env).auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          // ★ 실패 사유를 그대로 보여주지 않는다. "user not found" 와
          //   "wrong password" 를 구분해 보여주면 어떤 이메일이 가입돼 있는지
          //   알려주는 셈이다(FR-045).
          setError("이메일 또는 비밀번호가 맞지 않다.");
          return false;
        }
        return true;
      } catch {
        setError("로그인 중 문제가 생겼다. 잠시 뒤 다시 시도해줘.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [env],
  );

  const signOut = useCallback(async () => {
    if (!env) return;
    await browserClient(env).auth.signOut();
    router.replace("/login");
    // refresh 로 서버 컴포넌트와 proxy 가 비워진 쿠키를 다시 보게 한다 —
    // 이게 없으면 캐시된 화면이 로그인된 것처럼 남는다.
    router.refresh();
  }, [env, router]);

  return { signIn, signOut, pending, error, configured: env !== null };
}
