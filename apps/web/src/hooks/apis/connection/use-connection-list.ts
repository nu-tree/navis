"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { McpConnectionList } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getConnectionListQueryOptions = queryOptions({
  queryKey: ["connections"],
  queryFn: async () => {
    const res = await fetchGet<McpConnectionList>("/api/connections");
    if (!res.ok) throw new Error("연결 목록을 불러오지 못했습니다.");
    return res.data.items;
  },
});

/** 내 나비스에 붙은 AI 앱(외부 MCP 연결) 목록. 토큰 원문은 오지 않는다. */
export const useConnectionList = () => useQuery(getConnectionListQueryOptions);
