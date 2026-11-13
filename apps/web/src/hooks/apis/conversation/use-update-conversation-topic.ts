"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/common/use-toast";
import { fetchPatch } from "@/utils/fetch-client";
import { getConversationListQueryOptions } from "./use-conversation-list";

/** 주제 고치기 — 방 이름도 함께 바뀐다. */
export const useUpdateConversationTopic = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ id, topic }: { id: string; topic: string }) => {
      const res = await fetchPatch(`/api/conversations/${id}`, { topic });
      if (!res.ok) {
        console.error(`[use-update-conversation-topic] ${res.error.status} ${res.error.message}`);
        throw new Error("주제를 바꾸지 못했습니다.");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getConversationListQueryOptions.queryKey }),
    onError: (error) => toast.error(error.message),
  });
};
