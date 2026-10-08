"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { RecallHit } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getMemoryNeighborListQueryOptions = (memoryId: string) =>
  queryOptions({
    queryKey: ["memory", "neighbor", "list", memoryId],
    queryFn: async () => {
      const res = await fetchGet<RecallHit[]>(`/api/memories/${memoryId}/neighbors`);
      if (!res.ok) throw new Error("비슷한 기억을 불러오지 못했습니다.");
      return res.data;
    },
  });

/** 이 기억과 겹치는 기억 — 펼쳤을 때만 부른다(FR-047) */
export const useMemoryNeighborList = (memoryId: string, enabled: boolean) => {
  return useQuery({ ...getMemoryNeighborListQueryOptions(memoryId), enabled });
};
