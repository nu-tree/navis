"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Conversation, Message } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getConversationMessageListQueryOptions = (conversationId: string) =>
  queryOptions({
    queryKey: ["conversation", "message", "list", conversationId],
    queryFn: async (): Promise<Message[]> => {
      const res = await fetchGet<Conversation>(`/api/conversations/${conversationId}`);
      // 첫 메시지 전의 방은 서버에 없다 — 빈 대화로 시작하는 게 맞다.
      if (!res.ok && res.error.status === 404) return [];
      if (!res.ok) {
        throw new Error(res.error.message || "대화를 불러오지 못했습니다.");
      }
      return res.data.messages;
    },
    // 방을 열 때마다(패널이 key 로 다시 마운트된다) 서버에서 다시 받아 서버 기록과 맞춘다.
    // 이 탭에서 오간 메시지는 use-chat 이 이 캐시에 직접 쓴다.
    staleTime: 0,
    // 창 포커스로는 다시 받지 않는다. 화면에만 있는 중지된 부분 답(FR-004)을 서버
    // 응답이 덮어 사라지게 한다.
    refetchOnWindowFocus: false,
  });

/** 대화방 하나의 메시지 목록 조회 */
export const useConversationMessageList = (conversationId: string) => {
  return useQuery(getConversationMessageListQueryOptions(conversationId));
};
