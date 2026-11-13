"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConversationSummary } from "@navis/validation";
import { useToast } from "@/hooks/common/use-toast";
import { fetchPost } from "@/utils/fetch-client";
import { getConversationListQueryOptions } from "./use-conversation-list";

/** 주제 방 만들기. 주제가 곧 방 이름이다(2026-11-13). */
export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (topic: string) => {
      const res = await fetchPost<ConversationSummary>("/api/conversations", { topic });
      if (!res.ok) {
        console.error(`[use-create-conversation] ${res.error.status} ${res.error.message}`);
        throw new Error("방을 만들지 못했습니다.");
      }
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getConversationListQueryOptions.queryKey }),
    onError: (error) => toast.error(error.message),
  });
};
