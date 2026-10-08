"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClaudeTokenStatus } from "@navis/validation";
import { useToast } from "@/hooks/common/use-toast";
import { fetchDelete } from "@/utils/fetch-client";
import { getClaudeTokenStatusQueryOptions } from "./use-claude-token-status";

/** Claude 토큰 삭제. 삭제하면 다시 등록할 때까지 대화가 되지 않는다. */
export const useDeleteClaudeToken = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetchDelete<ClaudeTokenStatus>("/api/settings/claude-token");
      if (!res.ok) {
        console.error(`[use-delete-claude-token] ${res.error.status}`);
        throw new Error("토큰을 삭제하지 못했습니다.");
      }
      return res.data;
    },
    onSuccess: (status) => {
      toast.success("토큰을 삭제했습니다.");
      queryClient.setQueryData(getClaudeTokenStatusQueryOptions.queryKey, status);
    },
    onError: (error) => toast.error(error.message),
  });
};
