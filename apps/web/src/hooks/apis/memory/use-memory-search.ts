"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { RecallHit, RecallInput } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getMemorySearchQueryOptions = (params: RecallInput) =>
  queryOptions({
    queryKey: ["memory", "search", params],
    queryFn: async () => {
      const res = await fetchGet<RecallHit[]>("/api/memories/search", { params });
      if (!res.ok) throw new Error("기억을 검색하지 못했습니다.");
      return res.data;
    },
    // 검색은 임베딩 호출이 든다 — 같은 검색어를 다시 보면 캐시를 쓴다.
    staleTime: 30_000,
  });

/** 기억 의미 검색 — 대화의 불러오기와 같은 기준으로 정렬된다(FR-022) */
export const useMemorySearch = (params: RecallInput) => {
  return useQuery({ ...getMemorySearchQueryOptions(params), enabled: params.query.length > 0 });
};
