"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/common/use-toast";
import { fetchDelete } from "@/utils/fetch-client";
import { getConnectionListQueryOptions } from "./use-connection-list";

/** 연결 끊기 — 그 앱은 바로 내 기억에 닿지 못한다. 다시 쓰려면 다시 연결한다. */
export const useRevokeConnection = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchDelete(`/api/connections/${id}`);
      // 404 는 이미 끊겼다는 뜻이라 성공으로 친다.
      if (!res.ok && res.error.status !== 404) {
        console.error(`[use-revoke-connection] ${res.error.status}`);
        throw new Error("연결을 끊지 못했습니다.");
      }
    },
    onSuccess: () => {
      toast.success("연결을 끊었어요.");
      void queryClient.invalidateQueries(getConnectionListQueryOptions);
    },
    onError: (error) => toast.error(error.message),
  });
};
