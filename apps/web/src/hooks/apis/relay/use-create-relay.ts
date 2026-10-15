"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RelayCreateInput, RelayItem } from "@navis/validation";
import { useToast } from "@/hooks/common/use-toast";
import { fetchPost } from "@/utils/fetch-client";
import { getRelayListQueryOptions } from "./use-relay-list";

const failureText = (status: number) => {
  // 받는 회원의 토큰으로 대신 보내지 않는다(specs/004 FR-023) — 관리자가 먼저 등록해야 한다.
  if (status === 409) return "관리자 Claude 토큰을 먼저 설정에서 등록해 주세요.";
  if (status === 404) return "그 회원을 찾지 못했어요.";
  if (status === 400) return "받는 사람과 전할 말을 확인해 주세요.";
  if (status === 403) return "관리자만 쓸 수 있어요.";
  return "보내지 못했어요.";
};

/** 전하기 하나를 맡긴다. 도착은 1–2분 뒤 — 기록 목록이 상태를 따라간다. */
export const useCreateRelay = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: RelayCreateInput) => {
      const res = await fetchPost<RelayItem>("/api/relays", input);
      if (!res.ok) throw new Error(failureText(res.error.status));
      return res.data;
    },
    onSuccess: (item) => {
      toast.success(`${item.to} 님께 전하기를 맡겼어요. 1–2분 안에 도착해요.`);
      queryClient.setQueryData(getRelayListQueryOptions.queryKey, (prev: RelayItem[] | undefined) => [
        item,
        ...(prev ?? []),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
};
