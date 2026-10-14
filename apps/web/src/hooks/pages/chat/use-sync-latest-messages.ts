"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Conversation, Message } from "@navis/validation";
import { getConversationMessageListQueryOptions } from "@/hooks/apis/conversation/use-conversation-message-list";
import { getChatTurn } from "@/store/chat-turn-store";
import { fetchGet } from "@/utils/fetch-client";

/**
 * 화면에 없는 사이에 서버에서 생긴 메시지를 가져온다 — 나비스가 먼저 건 말(약속, specs/003).
 *
 * 방을 열 때만 메시지를 받아 오므로, 창을 열어 둔 채 있으면 나비스가 먼저 말을 걸어도 새로고침 전까지
 * 안 보였다. 두 신호에 맞춰 최근 페이지를 다시 받는다.
 * - 푸시가 왔다: 서비스 워커가 열린 창에 알린다(public/sw.js 의 new-message).
 * - 창으로 돌아왔다: 푸시가 꺼진 기기 대비.
 *
 * 캐시 전체를 갈아끼우지 않는다. 받은 최근 페이지의 가장 오래된 메시지부터 끝까지만 바꾼다 — 위로 올려
 * 읽던 이전 메시지는 그대로 남는다. 그 메시지가 캐시에 없으면(오래 떠나 있었다) 통째로 바꾼다.
 * 이 방에서 턴이 도는 중엔 건드리지 않는다 — 보낸 질문과 오는 답은 use-chat 이 쓰고 있다.
 */
export const useSyncLatestMessages = (conversationId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { queryKey } = getConversationMessageListQueryOptions(conversationId);

    const sync = async () => {
      if (getChatTurn(conversationId).streaming !== null) return;
      const res = await fetchGet<Conversation>(`/api/conversations/${encodeURIComponent(conversationId)}`);
      if (!res.ok || getChatTurn(conversationId).streaming !== null) return;
      const latest = res.data.messages;
      queryClient.setQueryData(queryKey, (old: Message[] = []) => {
        const start = latest[0] ? old.findIndex((m) => m.id === latest[0]?.id) : -1;
        return start === -1 ? latest : [...old.slice(0, start), ...latest];
      });
    };

    const onVisible = () => {
      if (!document.hidden) void sync();
    };
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; conversationId?: string } | null;
      if (data?.type === "new-message" && data.conversationId === conversationId) void sync();
    };

    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [conversationId, queryClient]);
};
