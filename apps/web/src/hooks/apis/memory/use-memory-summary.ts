"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { MemorySummary } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getMemorySummaryQueryOptions = (days: number) =>
  queryOptions({
    queryKey: ["memory", "summary", days],
    queryFn: async () => {
      const res = await fetchGet<MemorySummary>("/api/memories/summary", { params: { days } });
      if (!res.ok) throw new Error("기억 요약을 불러오지 못했습니다.");
      return res.data;
    },
  });

/** 최근 N일 분류별 개수 — 기억 화면 맨 위 요약. */
export const useMemorySummary = (days: number) => useQuery(getMemorySummaryQueryOptions(days));
