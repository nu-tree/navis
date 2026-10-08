"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/common/use-toast";
import { browserClient, supabaseEnv } from "@/lib/supabase";

/** 로그아웃. 로그인 화면으로 옮긴다. */
export const useSignOut = () => {
  const router = useRouter();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const env = supabaseEnv();
      if (!env) return;
      const { error } = await browserClient(env).auth.signOut();
      if (error) throw new Error("로그아웃하지 못했습니다.");
    },
    onSuccess: () => {
      router.replace("/login");
      // refresh 로 서버 컴포넌트와 proxy 가 비워진 쿠키를 다시 보게 한다 —
      // 이게 없으면 캐시된 화면이 로그인된 것처럼 남는다.
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });
};
