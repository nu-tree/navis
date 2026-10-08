"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/common/use-toast";
import { fetchDelete } from "@/utils/fetch-client";
import { getConversationListQueryOptions } from "./use-conversation-list";
import { getConversationMessageListQueryOptions } from "./use-conversation-message-list";

/** 대화방 삭제 (optimistic update 적용) */
export const useDeleteConversation = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { queryKey } = getConversationListQueryOptions;

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetchDelete(`/api/conversations/${conversationId}`);
      // 404 는 이미 없다는 뜻이라 성공으로 친다 — 되살리면 사용자가 혼란스럽다.
      if (!res.ok && res.error.status !== 404) {
        // 원문(BFF 응답 본문)은 콘솔에만 남긴다 — 토스트에는 사람이 읽을 문구만.
        console.error(`[use-delete-conversation] ${res.error.status} ${res.error.message}`);
        throw new Error("대화를 삭제하지 못했습니다.");
      }
    },
    // 목록에서 먼저 뺀다 — 왕복을 기다리면 클릭이 굼떠 보인다.
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old) => old?.filter((r) => r.id !== conversationId));
      return { previousData };
    },
    // 지운 줄 알았는데 남아 있는 것보다 되돌리는 게 낫다.
    onError: (error, _conversationId, context) => {
      if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
      toast.error(error.message);
    },
    onSuccess: (_data, conversationId) => {
      toast.success("대화를 삭제했습니다.");
      queryClient.removeQueries({
        queryKey: getConversationMessageListQueryOptions(conversationId).queryKey,
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
};
