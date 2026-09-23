"use client";

import { useCallback, useEffect, useState } from "react";
import type { Conversation, Message } from "@navis/validation";

/**
 * 방 하나의 메시지. 방을 바꾸면 그 방의 것으로 교체된다(FR-031).
 *
 * 아직 서버에 없는 새 방(첫 메시지 전)은 404 가 정상이므로 빈 목록으로 시작한다.
 */
export function useConversation(id: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/conversations/${id}`);
        if (cancelled) return;
        // 첫 메시지 전의 방은 서버에 없다 — 빈 대화로 시작하는 게 맞다.
        if (res.status === 404) {
          setMessages([]);
          return;
        }
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
        const room = (await res.json()) as Conversation;
        if (!cancelled) setMessages(room.messages);
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();

    // 방을 빠르게 바꾸면 늦게 온 응답이 새 방의 메시지를 덮는다.
    return () => {
      cancelled = true;
    };
  }, [id]);

  const removeMessage = useCallback(
    async (messageId: string) => {
      const previous = messages;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      try {
        const res = await fetch(`/api/conversations/${id}/messages/${messageId}`, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 404) throw new Error(res.statusText);
      } catch {
        setMessages(previous);
      }
    },
    [id, messages],
  );

  return { messages, setMessages, removeMessage };
}
