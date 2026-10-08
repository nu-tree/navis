"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ConversationSummary } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getConversationListQueryOptions = queryOptions({
  queryKey: ["conversation", "list"],
  queryFn: async () => {
    const res = await fetchGet<ConversationSummary[]>("/api/conversations");
    if (!res.ok) {
      throw new Error(res.error.message || "대화 목록을 불러오지 못했습니다.");
    }
    return res.data;
  },
});

/** 대화방 목록 조회 */
export const useConversationList = () => {
  return useQuery(getConversationListQueryOptions);
};
