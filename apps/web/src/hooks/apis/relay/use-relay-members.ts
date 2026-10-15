"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Member } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getRelayMembersQueryOptions = queryOptions({
  queryKey: ["relays", "members"],
  queryFn: async () => {
    const res = await fetchGet<Member[]>("/api/relays/members");
    if (!res.ok) throw new Error("회원 목록을 불러오지 못했어요.");
    return res.data;
  },
  staleTime: 5 * 60 * 1000,
});

/** 받는 사람으로 고를 수 있는 회원(관리자 전용). */
export const useRelayMembers = (enabled: boolean) => useQuery({ ...getRelayMembersQueryOptions, enabled });
