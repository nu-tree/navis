"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { McpTokenIssued } from "@navis/validation";
import { useToast } from "@/hooks/common/use-toast";
import { fetchPost } from "@/utils/fetch-client";
import { getConnectionListQueryOptions } from "./use-connection-list";

/**
 * 직접 연결용 토큰 발급. 원문은 이 응답에만 있다 — 화면이 한 번 보여주고 버린다.
 * 실패 로그에 응답을 남기지 않는다.
 */
export const useIssueConnectionToken = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (label?: string) => {
      const res = await fetchPost<McpTokenIssued>("/api/connections", label ? { label } : {});
      if (!res.ok) {
        console.error(`[use-issue-connection-token] ${res.error.status}`);
        throw new Error("토큰을 만들지 못했습니다.");
      }
      return res.data;
    },
    onSuccess: () => void queryClient.invalidateQueries(getConnectionListQueryOptions),
    onError: (error) => toast.error(error.message),
  });
};
