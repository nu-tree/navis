"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RenameProjectInput, RenameProjectResult } from "@navis/validation";
import { useToast } from "@/hooks/common/use-toast";
import { fetchPost } from "@/utils/fetch-client";
import { invalidateMemoryViews } from "./invalidate-memory";

/** 프로젝트 이름 바꾸기 · 합치기 — to 가 이미 있으면 합쳐진다. 되돌릴 수 없다. */
export const useRenameMemoryProject = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: RenameProjectInput) => {
      const res = await fetchPost<RenameProjectResult>("/api/memories/projects/rename", input);
      if (!res.ok) {
        console.error(`[use-rename-memory-project] ${res.error.status} ${res.error.message}`);
        throw new Error(
          res.error.status === 404
            ? `'${input.from}' 프로젝트가 이미 없습니다.`
            : "프로젝트 이름을 바꾸지 못했습니다.",
        );
      }
      return res.data;
    },
    onSuccess: (r) => {
      toast.success(
        r.merged
          ? `${r.from} → ${r.to} 로 합쳤습니다 (기억 ${r.moved}건).`
          : `${r.from} → ${r.to} 로 이름을 바꿨습니다.`,
      );
      void invalidateMemoryViews(queryClient);
    },
    onError: (error) => toast.error(error.message),
  });
};
