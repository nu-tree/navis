"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MESSAGE_PAGE_SIZE, type Message, type MessagePage } from "@navis/validation";
import { getConversationMessageListQueryOptions } from "@/hooks/apis/conversation/use-conversation-message-list";
import { fetchGet } from "@/utils/fetch-client";

/** 맨 위에서 이만큼 안쪽에 닿으면 이전 메시지를 미리 부른다. */
const TOP_THRESHOLD_PX = 200;

/**
 * 위로 올리면 이전 메시지를 더 불러온다(specs/003 FR-026).
 *
 * 방을 열면 서버가 최근 50개만 준다. 맨 위 근처에 닿으면 가장 오래된 메시지 id 를 커서로 다음 50개를
 * 받아 캐시 앞에 붙인다. 캐시 형태(Message[])는 그대로라 보내기 · 지우기 쪽은 바뀌지 않는다.
 *
 * 붙인 뒤에도 읽던 자리가 그대로여야 한다 — 위에 내용이 늘어난 만큼 스크롤을 내려 준다.
 */
export const useLoadOlderMessages = (
  conversationId: string,
  messages: readonly Message[],
  scrollRef: RefObject<HTMLElement | null>,
) => {
  const queryClient = useQueryClient();
  const { queryKey } = getConversationMessageListQueryOptions(conversationId);
  // 서버가 "더 없음"이라고 한 방. 첫 페이지가 50개 미만이면 처음부터 끝이다.
  const [exhausted, setExhausted] = useState(false);
  const loading = useRef(false);
  // 붙이기 직전의 스크롤 높이. 붙인 뒤 그 차이만큼 내려 읽던 자리를 지킨다.
  const anchor = useRef<number | null>(null);

  const hasMore = !exhausted && messages.length >= MESSAGE_PAGE_SIZE;

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!hasMore || loading.current || !oldest) return;
    loading.current = true;
    try {
      const res = await fetchGet<MessagePage>(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages?before=${encodeURIComponent(oldest.id)}`,
      );
      if (!res.ok) {
        // 커서가 서버에 없는 메시지(화면에만 있는 중지된 답)면 더 올라갈 수 없다.
        setExhausted(true);
        return;
      }
      if (!res.data.hasMore) setExhausted(true);
      if (!res.data.messages.length) return;
      anchor.current = scrollRef.current?.scrollHeight ?? null;
      queryClient.setQueryData(queryKey, (old: Message[] = []) => {
        const known = new Set(old.map((m) => m.id));
        return [...res.data.messages.filter((m) => !known.has(m.id)), ...old];
      });
    } finally {
      loading.current = false;
    }
  };

  // 앞에 붙인 만큼 내려 읽던 메시지가 제자리에 있게 한다. 그리기 전에 해야 튀지 않는다.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && anchor.current !== null) {
      el.scrollTop += el.scrollHeight - anchor.current;
      anchor.current = null;
    }
  }, [messages, scrollRef]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop < TOP_THRESHOLD_PX) void loadOlder();
  };

  return { onScroll, hasMore };
};
