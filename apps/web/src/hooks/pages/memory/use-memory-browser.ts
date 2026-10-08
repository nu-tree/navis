"use client";

import { useState } from "react";
import type { Category, Memory } from "@navis/validation";
import { useMemoryList } from "@/hooks/apis/memory/use-memory-list";
import { useMemorySearch } from "@/hooks/apis/memory/use-memory-search";

/** 기간 필터. 값은 recentInputSchema 의 days 다. */
export const PERIODS = [
  { value: "all", label: "전체 기간", days: undefined },
  { value: "1", label: "최근 1일", days: 1 },
  { value: "7", label: "최근 7일", days: 7 },
  { value: "30", label: "최근 30일", days: 30 },
] as const;
export type Period = (typeof PERIODS)[number]["value"];

/** 프로젝트 필터의 특수값. 실제 프로젝트 이름과 겹치지 않게 밑줄 두 개로 시작한다. */
export const PROJECT_ALL = "__all";
export const PROJECT_PERSONAL = "__personal";

export type BrowsedMemory = { memory: Memory; score?: number };

/**
 * 기억 화면의 목록 — 필터 상태를 갖고, 검색어가 있으면 의미 검색 · 없으면 최신순 목록을 보여준다.
 *
 * 검색은 **제출할 때만** 돈다(입력할 때마다가 아니다) — 검색마다 임베딩 호출이 든다.
 * 기간 필터는 목록에만 걸린다. 의미 검색(recall)은 기간 대신 시간 가중치로 정렬한다.
 */
export const useMemoryBrowser = () => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [project, setProject] = useState<string>(PROJECT_ALL);
  const [period, setPeriod] = useState<Period>("all");

  // 기억 화면은 정리하는 자리라 고른 범위만 정확히 보여준다 — 대화의 "프로젝트 + 개인 기억"
  // 규칙(FR-018)을 쓰면 개인 기억이 섞여 필터가 안 먹는 것처럼 보인다.
  const filters = {
    ...(category !== "all" ? { category } : {}),
    ...(project === PROJECT_PERSONAL
      ? { personalOnly: true }
      : project !== PROJECT_ALL
        ? { project, exactProject: true }
        : {}),
  };
  const days = PERIODS.find((p) => p.value === period)?.days;

  const searching = query.length > 0;
  const list = useMemoryList({ ...filters, ...(days ? { days } : {}) }, !searching);
  const search = useMemorySearch({ query, ...filters, limit: 50 });
  const active = searching ? search : list;

  const items: BrowsedMemory[] = searching
    ? (search.data ?? [])
    : (list.data?.pages.flat() ?? []).map((memory) => ({ memory }));

  return {
    items,
    isLoading: active.isLoading,
    error: active.error?.message ?? null,
    searching,
    // 검색은 상위 50건만 — 더 보기는 목록에만 있다.
    hasMore: !searching && list.hasNextPage,
    loadingMore: list.isFetchingNextPage,
    loadMore: () => void list.fetchNextPage(),
    query,
    search: (text: string) => setQuery(text.trim()),
    clearSearch: () => setQuery(""),
    category,
    setCategory,
    project,
    setProject,
    period,
    setPeriod,
  };
};
