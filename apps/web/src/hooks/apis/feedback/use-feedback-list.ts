"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { FeedbackItem } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getFeedbackListQueryOptions = queryOptions({
  queryKey: ["feedback", "list"],
  queryFn: async () => {
    const res = await fetchGet<FeedbackItem[]>("/api/feedback");
    if (!res.ok) throw new Error("피드백을 불러오지 못했어요.");
    return res.data;
  },
});

/** 회원들이 보낸 피드백, 최신순(관리자 전용). */
export const useFeedbackList = (enabled: boolean) => useQuery({ ...getFeedbackListQueryOptions, enabled });
