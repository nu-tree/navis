"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { RelayItem } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

/** 끝나지 않은 전하기가 있을 때 다시 읽는 간격. tick 이 1분마다라 몇 초면 충분하다. */
const POLL_MS = 5000;

export const getRelayListQueryOptions = queryOptions({
  queryKey: ["relays", "list"],
  queryFn: async () => {
    const res = await fetchGet<RelayItem[]>("/api/relays");
    if (!res.ok) throw new Error("보낸 기록을 불러오지 못했어요.");
    return res.data;
  },
});

const isOpen = (r: RelayItem) => r.status === "pending" || r.status === "running";

/**
 * 보낸 전하기 기록, 최신순(관리자 전용).
 * 대기 · 전하는 중인 것이 있을 때만 다시 읽는다 — 없으면 멈춘다(research R10, 새 실시간 통로를 만들지 않는다).
 */
export const useRelayList = (enabled: boolean) =>
  useQuery({
    ...getRelayListQueryOptions,
    enabled,
    refetchInterval: (query) => (query.state.data?.some(isOpen) ? POLL_MS : false),
  });
