"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { PromiseItem } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getConversationPromiseListQueryOptions = (conversationId: string) =>
  queryOptions({
    queryKey: ["conversation", "promise", "list", conversationId],
    queryFn: async (): Promise<PromiseItem[]> => {
      const res = await fetchGet<PromiseItem[]>(`/api/conversations/${conversationId}/promises`);
      if (!res.ok) throw new Error(res.error.message || "약속을 불러오지 못했습니다.");
      return res.data;
    },
  });

/** 이 방의 켜진 약속(오른쪽 패널). */
export const useConversationPromiseList = (conversationId: string) =>
  useQuery(getConversationPromiseListQueryOptions(conversationId));
