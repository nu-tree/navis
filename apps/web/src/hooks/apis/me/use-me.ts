"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchGet } from "@/utils/fetch-client";

type Me = { admin: boolean };

export const getMeQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const res = await fetchGet<Me>("/api/me");
    if (!res.ok) throw new Error("회원 정보를 불러오지 못했습니다.");
    return res.data;
  },
  // 세션 동안 바뀌지 않는다.
  staleTime: Infinity,
});

/** 요청 회원이 관리자인지. 모르는 동안(로딩 · 실패)은 관리자가 아닌 것으로 본다. */
export const useIsAdmin = () => {
  const { data } = useQuery(getMeQueryOptions);
  return data?.admin ?? false;
};
