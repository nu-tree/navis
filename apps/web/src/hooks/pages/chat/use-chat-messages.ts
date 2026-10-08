"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Message } from "@navis/validation";
import { getConversationMessageListQueryOptions, useConversationMessageList } from "@/hooks/apis/conversation/use-conversation-message-list";
import { useDeleteConversationMessage } from "@/hooks/apis/conversation/use-delete-conversation-message";

/**
 * 채팅 패널의 메시지 — 조회 · 삭제 · 캐시 쓰기를 묶는다.
 *
 * 스트리밍으로 확정된 답과 중지된 부분 답은 서버 응답이 아니라 캐시에 직접 쓴다.
 * setMessages 는 useState 의 setter 와 같은 모양이라 useChat 이 그대로 쓴다.
 */
export const useChatMessages = (conversationId: string) => {
  const queryClient = useQueryClient();
  const { queryKey } = getConversationMessageListQueryOptions(conversationId);
  const { data: messages = [] } = useConversationMessageList(conversationId);
  const { mutate: removeMessage } = useDeleteConversationMessage(conversationId);

  const setMessages: React.Dispatch<React.SetStateAction<Message[]>> = (action) =>
    queryClient.setQueryData(queryKey, (old = []) =>
      typeof action === "function" ? action(old) : action,
    );

  return { messages, setMessages, removeMessage };
};
