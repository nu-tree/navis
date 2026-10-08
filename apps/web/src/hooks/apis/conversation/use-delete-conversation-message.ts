"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/common/use-toast";
import { fetchDelete } from "@/utils/fetch-client";
import { getConversationMessageListQueryOptions } from "./use-conversation-message-list";

/** 대화방 메시지 하나 삭제 (optimistic update 적용) */
export const useDeleteConversationMessage = (conversationId: string) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { queryKey } = getConversationMessageListQueryOptions(conversationId);

  return useMutation({
    mutationFn: async (messageId: string) => {
      const res = await fetchDelete(`/api/conversations/${conversationId}/messages/${messageId}`);
      // 중지된 부분 답은 서버에 없다(FR-004) — 404 도 성공으로 친다.
      if (!res.ok && res.error.status !== 404) {
        // 원문(BFF 응답 본문)은 콘솔에만 남긴다 — 토스트에는 사람이 읽을 문구만.
        console.error(`[use-delete-conversation-message] ${res.error.status} ${res.error.message}`);
        throw new Error("메시지를 삭제하지 못했습니다.");
      }
    },
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old) => old?.filter((m) => m.id !== messageId));
      return { previousData };
    },
    onError: (error, _messageId, context) => {
      if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("메시지를 삭제했습니다.");
    },
    // 성공 뒤 다시 받지 않는다 — 화면에만 있는 중지된 부분 답(FR-004)이 서버 응답에 덮인다.
  });
};
