"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FeedbackItem } from "@navis/validation";
import { useToast } from "@/hooks/common/use-toast";
import { fetchPatch } from "@/utils/fetch-client";
import { getFeedbackListQueryOptions } from "./use-feedback-list";

/** 처리함 표시를 켜고 끈다. 목록의 그 항목만 바꾼다. */
export const useSetFeedbackDone = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const res = await fetchPatch<FeedbackItem>(`/api/feedback/${encodeURIComponent(id)}`, { done });
      if (!res.ok) throw new Error("처리 표시를 바꾸지 못했어요.");
      return res.data;
    },
    onSuccess: (item) => {
      queryClient.setQueryData(getFeedbackListQueryOptions.queryKey, (prev: FeedbackItem[] | undefined) =>
        prev?.map((f) => (f.id === item.id ? item : f)),
      );
    },
    onError: (error) => toast.error(error.message),
  });
};
