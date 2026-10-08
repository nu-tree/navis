"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/common/use-toast";
import { browserClient, supabaseEnv } from "@/lib/supabase";

/** 새 비밀번호 정하기 — 초대받은 첫 로그인 · 비밀번호 재설정. 메일 링크(/auth/confirm)로 이미 로그인돼 있다. */
export const useUpdatePassword = () => {
  const router = useRouter();
  const toast = useToast();

  return useMutation({
    mutationFn: async (password: string) => {
      const env = supabaseEnv();
      if (!env) throw new Error("로그인이 설정되지 않았다.");
      const { error } = await browserClient(env).auth.updateUser({ password });
      if (error) {
        // 같은 비밀번호 · 너무 약한 비밀번호 등. 원문은 영어라 사람이 읽을 문구로 바꾼다.
        console.error(`[use-update-password] ${error.code ?? error.status}`);
        throw new Error(
          error.code === "same_password"
            ? "지금 비밀번호와 다른 비밀번호를 써 주세요."
            : error.code === "weak_password"
              ? "비밀번호가 너무 약해요. 더 길게 써 주세요."
              : "비밀번호를 바꾸지 못했어요. 메일 링크가 만료됐다면 다시 요청해 주세요.",
        );
      }
    },
    onSuccess: () => {
      toast.success("비밀번호를 정했어요.");
      router.replace("/");
      router.refresh();
    },
    // 실패 문구는 폼 안에 띄운다 — 입력을 고치는 자리 바로 위에.
  });
};
