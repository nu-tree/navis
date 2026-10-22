"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { PlanUsageStatus } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getPlanUsageQueryOptions = queryOptions({
  queryKey: ["settings", "usage"],
  queryFn: async () => {
    const res = await fetchGet<PlanUsageStatus>("/api/settings/usage");
    if (!res.ok) throw new Error("사용량을 불러오지 못했습니다.");
    return res.data;
  },
});

/** Claude 요금제 한도 — 나비스로 대화할 때 마지막으로 받은 값. 받은 적 없으면 null */
export const usePlanUsage = () => {
  return useQuery(getPlanUsageQueryOptions);
};
