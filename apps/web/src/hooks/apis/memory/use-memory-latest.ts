"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Category, Memory } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

type Params = { category: Category; limit: number };

// 키가 ["memory", "list", …] 로 시작해야 기억이 바뀔 때 목록과 함께 낡는다(invalidate-memory.ts).
export const getMemoryLatestQueryOptions = (params: Params) =>
  queryOptions({
    queryKey: ["memory", "list", "latest", params],
    queryFn: async () => {
      const res = await fetchGet<Memory[]>("/api/memories", { params });
      if (!res.ok) throw new Error("기억을 불러오지 못했습니다.");
      return res.data;
    },
  });

/** 한 분류의 가장 최근 기억 몇 개 — "한눈에" 카드용. 더 보기가 없어 목록 훅보다 가볍다. */
export const useMemoryLatest = (params: Params) => useQuery(getMemoryLatestQueryOptions(params));
