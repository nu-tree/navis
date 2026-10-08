"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ProjectSummary } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getMemoryProjectListQueryOptions = queryOptions({
  queryKey: ["memory", "project", "list"],
  queryFn: async () => {
    const res = await fetchGet<ProjectSummary[]>("/api/memories/projects");
    if (!res.ok) throw new Error("프로젝트 목록을 불러오지 못했습니다.");
    return res.data;
  },
});

/** 프로젝트 스코프 목록 — 필터 · 수정 화면의 선택지 */
export const useMemoryProjectList = () => {
  return useQuery(getMemoryProjectListQueryOptions);
};
