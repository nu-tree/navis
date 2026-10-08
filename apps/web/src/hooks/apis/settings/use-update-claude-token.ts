"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClaudeTokenStatus } from "@navis/validation";
import { useToast } from "@/hooks/common/use-toast";
import { fetchClient } from "@/utils/fetch-client";
import { getClaudeTokenStatusQueryOptions } from "./use-claude-token-status";

/** Claude 토큰 등록 · 교체. 저장하면 다음 턴부터 그 토큰으로 답한다 — 재배포가 필요 없다. */
export const useUpdateClaudeToken = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (token: string) => {
      const res = await fetchClient<ClaudeTokenStatus>("/api/settings/claude-token", {
        method: "PUT",
        body: { token },
      });
      // 실패 로그에 요청 본문(토큰)을 남기지 않는다 — 상태 코드만.
      if (!res.ok) {
        console.error(`[use-update-claude-token] ${res.error.status}`);
        throw new Error(res.error.status === 400 ? "토큰이 비어 있습니다." : "토큰을 저장하지 못했습니다.");
      }
      return res.data;
    },
    onSuccess: (status) => {
      toast.success("토큰을 저장했습니다. 다음 대화부터 이 토큰을 씁니다.");
      queryClient.setQueryData(getClaudeTokenStatusQueryOptions.queryKey, status);
    },
    onError: (error) => toast.error(error.message),
  });
};
