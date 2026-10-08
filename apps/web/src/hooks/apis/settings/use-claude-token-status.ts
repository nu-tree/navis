"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ClaudeTokenStatus } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getClaudeTokenStatusQueryOptions = queryOptions({
  queryKey: ["settings", "claude-token"],
  queryFn: async () => {
    const res = await fetchGet<ClaudeTokenStatus>("/api/settings/claude-token");
    if (!res.ok) {
      // 서버가 사람이 읽을 문구를 준다(키가 바뀌었을 때의 안내 등).
      const detail = (() => {
        try {
          return (JSON.parse(res.error.message) as { error?: string }).error;
        } catch {
          return undefined;
        }
      })();
      throw new Error(detail ?? "토큰 상태를 불러오지 못했습니다.");
    }
    return res.data;
  },
});

/** Claude 토큰 상태 — 등록 여부 · 끝 4자리 · 변경 시각. 원문은 오지 않는다(FR-037) */
export const useClaudeTokenStatus = () => {
  return useQuery(getClaudeTokenStatusQueryOptions);
};
