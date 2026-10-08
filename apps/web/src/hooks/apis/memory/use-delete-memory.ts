"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/common/use-toast";
import { fetchDelete } from "@/utils/fetch-client";
import { invalidateMemoryViews } from "./invalidate-memory";

/** 기억 삭제 — 목록과 이후 답변 근거에서 함께 사라진다(FR-025) */
export const useDeleteMemory = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (memoryId: string) => {
      const res = await fetchDelete(`/api/memories/${memoryId}`);
      // 404 는 이미 없다는 뜻이라 성공으로 친다.
      if (!res.ok && res.error.status !== 404) {
        console.error(`[use-delete-memory] ${res.error.status} ${res.error.message}`);
        throw new Error("기억을 지우지 못했습니다.");
      }
    },
    onSuccess: () => {
      toast.success("기억을 지웠습니다.");
      void invalidateMemoryViews(queryClient);
    },
    onError: (error) => toast.error(error.message),
  });
};
