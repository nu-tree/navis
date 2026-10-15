"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClaudeTokenStatus } from "@navis/validation";
import { useToast } from "@/hooks/common/use-toast";
import { fetchClient } from "@/utils/fetch-client";
import { getClaudeTokenStatusQueryOptions } from "./use-claude-token-status";

/**
 * Claude 토큰 등록 · 교체. 서버가 저장 전에 한 마디로 확인한다(몇 초) — 거절되면 저장하지 않는다.
 * 저장하면 다음 턴부터 그 토큰으로 답한다 — 재배포가 필요 없다.
 */
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
        // 422: 저장 전에 Claude 에 물어봤더니 거절했다 — 저장하지 않았다.
        const message =
          res.error.status === 422
            ? "Claude 가 이 토큰을 받지 않았어요. 만료됐거나 일부만 복사됐을 수 있어요 — 다시 만들어 붙여 넣어 주세요."
            : res.error.status === 400
              ? "토큰이 비어 있습니다."
              : "토큰을 저장하지 못했습니다.";
        throw new Error(message);
      }
      return res.data;
    },
    onSuccess: (status) => {
      toast.success("Claude 와 연결됐어요 ✓ 이제 대화할 수 있어요.");
      queryClient.setQueryData(getClaudeTokenStatusQueryOptions.queryKey, status);
    },
    onError: (error) => toast.error(error.message),
  });
};
