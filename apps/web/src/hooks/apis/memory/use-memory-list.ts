"use client";

import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import type { Memory, RecentInput } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

/** 한 쪽에 받을 개수. */
export const MEMORY_PAGE_SIZE = 50;

type Params = Omit<RecentInput, "limit" | "offset">;

export const getMemoryListQueryOptions = (params: Params) =>
  infiniteQueryOptions({
    queryKey: ["memory", "list", params],
    queryFn: async ({ pageParam }) => {
      const res = await fetchGet<Memory[]>("/api/memories", {
        params: { ...params, limit: MEMORY_PAGE_SIZE, offset: pageParam },
      });
      if (!res.ok) throw new Error("기억 목록을 불러오지 못했습니다.");
      return res.data;
    },
    initialPageParam: 0,
    // 꽉 찬 쪽이 왔으면 더 있을 수 있다. 덜 찼으면 끝이다.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === MEMORY_PAGE_SIZE ? allPages.length * MEMORY_PAGE_SIZE : undefined,
  });

/** 기억 목록 조회 — 최신순, 분류 · 프로젝트 · 기간 필터, 50건씩 더 보기(FR-021) */
export const useMemoryList = (params: Params, enabled = true) => {
  return useInfiniteQuery({ ...getMemoryListQueryOptions(params), enabled });
};
