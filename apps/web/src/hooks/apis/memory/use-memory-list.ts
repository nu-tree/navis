"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Memory, RecentInput } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getMemoryListQueryOptions = (params: RecentInput) =>
  queryOptions({
    queryKey: ["memory", "list", params],
    queryFn: async () => {
      const res = await fetchGet<Memory[]>("/api/memories", { params });
      if (!res.ok) throw new Error("기억 목록을 불러오지 못했습니다.");
      return res.data;
    },
  });

/** 기억 목록 조회 — 최신순, 분류 · 프로젝트 · 기간 필터(FR-021) */
export const useMemoryList = (params: RecentInput, enabled = true) => {
  return useQuery({ ...getMemoryListQueryOptions(params), enabled });
};
