"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/common/use-toast";
import { fetchDelete } from "@/utils/fetch-client";
import { getConversationListQueryOptions } from "./use-conversation-list";

/**
 * 주제 방 지우기. 메시지는 함께 지워지고, 그 방에서 저장한 기억과 약속은 남는다 — 약속은 이후 "나비스" 방으로 온다.
 * "나비스" 방은 지울 수 없다(서버 409).
 */
export const useDeleteConversation = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchDelete(`/api/conversations/${id}`);
      if (!res.ok && res.error.status !== 404) {
        console.error(`[use-delete-conversation] ${res.error.status} ${res.error.message}`);
        throw new Error("방을 지우지 못했습니다.");
      }
    },
    onSuccess: () => {
      toast.success("방을 지웠어요.");
      return queryClient.invalidateQueries({ queryKey: getConversationListQueryOptions.queryKey });
    },
    onError: (error) => toast.error(error.message),
  });
};
