"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Memory, UpdateInput } from "@navis/validation";
import { useToast } from "@/hooks/common/use-toast";
import { fetchPatch } from "@/utils/fetch-client";
import { invalidateMemoryViews } from "./invalidate-memory";

type Options = {
  /** 성공 토스트 문구. 할 일 체크처럼 잦은 동작은 null 로 끈다. */
  successMessage?: string | null;
};

/** 기억 수정 — 내용 · 분류 · 프로젝트 · 태그 · 완료(FR-023, FR-027) */
export const useUpdateMemory = ({ successMessage = "기억을 고쳤습니다." }: Options = {}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateInput) => {
      const res = await fetchPatch<Memory>(`/api/memories/${id}`, patch);
      if (!res.ok) {
        console.error(`[use-update-memory] ${res.error.status} ${res.error.message}`);
        throw new Error(
          res.error.status === 404 ? "이미 지워진 기억입니다." : "기억을 고치지 못했습니다.",
        );
      }
      return res.data;
    },
    onSuccess: () => {
      if (successMessage) toast.success(successMessage);
      void invalidateMemoryViews(queryClient);
    },
    onError: (error) => toast.error(error.message),
  });
};
