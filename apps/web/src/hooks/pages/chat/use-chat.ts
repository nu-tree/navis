"use client";

import { useEffect, useSyncExternalStore } from "react";
import { parseChatEvents } from "@navis/api";
import type { ChatRequest, Message } from "@navis/validation";
import type { SendInput } from "@/features/chat/chat-input";
import { turnStore } from "@/features/chat/turn-store";
import { useCancelChat } from "@/hooks/apis/chat/use-cancel-chat";

type UseChatInput = {
  /** 이 턴이 속한 방. 서버가 이걸로 에이전트 세션을 이어 붙인다. */
  conversationId: string;
  /** 방의 메시지. 방을 바꾸면 교체된다 — 소유는 useConversation 이 한다(FR-031). */
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** 턴이 끝난 뒤. 방 목록 갱신에 쓴다. */
  onTurnEnd?: () => void;
};

// 한 대화방의 턴. 브라우저는 /api/chat(BFF)만 부른다 — apps/server 의 토큰은
// Next 서버에만 있다.
//
// 턴 상태는 이 훅이 아니라 turnStore 가 방별로 들고 있다(turn-store.ts 주석). 방을 옮겨도
// 스트림은 끝까지 읽히고, 돌아오면 같은 상태가 다시 보인다.
export function useChat({ conversationId, messages, setMessages, onTurnEnd }: UseChatInput) {
  const { mutate: cancelChat } = useCancelChat();
  const { streaming, tool, error, turnId } = useSyncExternalStore(
    turnStore.subscribe,
    () => turnStore.get(conversationId),
    () => turnStore.get(conversationId),
  );

  // 이 방이 화면에 열려 있는 동안만 끝난 턴의 메시지를 받는다.
  useEffect(
    () => turnStore.attach(conversationId, (incoming) => setMessages((prev) => [...prev, ...incoming])),
    [conversationId, setMessages],
  );

  const send = async ({ text, images, model }: SendInput) => {
    // 이 방에서 턴이 도는 중엔 새 턴을 만들지 않는다. 다른 방은 상관없다.
    if (turnStore.get(conversationId).streaming !== null) return;

    // 보내는 순간에는 방이 열려 있다 — 화면 목록에 바로 붙인다.
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text,
        createdAt: new Date().toISOString(),
        // 화면에 첨부를 보여주기 위해서만 담는다 — 서버는 저장 시 비운다.
        ...(images?.length ? { images } : {}),
      },
    ]);
    const id = crypto.randomUUID();
    turnStore.update(conversationId, { streaming: "", tool: null, error: null, turnId: id });
    // 중지 뒤 도착한 델타가 다음 턴에 섞이지 않게, 이 턴의 로컬 버퍼를 따로 둔다.
    let text_ = "";

    try {
      const body: ChatRequest = {
        conversationId,
        text,
        turnId: id,
        ...(images?.length ? { images } : {}),
        ...(model ? { model } : {}),
      };
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        throw new Error(await res.text().catch(() => res.statusText));
      }

      for await (const event of parseChatEvents(res.body)) {
        switch (event.type) {
          case "delta":
            text_ += event.text;
            turnStore.update(conversationId, { streaming: text_ });
            break;
          case "status":
            turnStore.update(conversationId, { tool: event.tool });
            break;
          case "done":
            // 최종 전문은 서버가 권위다 — 델타를 이어 붙인 것과 다를 수 있다.
            // message 에 saved 가 실려 오므로 저장 표시도 여기서 함께 확정된다.
            turnStore.deliver(conversationId, [event.message]);
            break;
          case "aborted":
            // 중지 시점까지 온 부분 답변은 화면에 남긴다 — 사라지면 사용자는
            // 무엇이 중단됐는지 알 수 없다.
            //
            // ★ 다만 **서버에 기록되지는 않는다**(FR-004, Q3=B). 방을 다시 열면
            //   사라지고 질문만 남는다. 그래서 이 메시지에는 id 를 새로 만들어
            //   붙이지만, 서버의 어떤 메시지와도 대응되지 않는다 — 삭제 버튼이
            //   404 를 받아도 정상이다.
            if (text_) {
              turnStore.deliver(conversationId, [
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  text: `${text_}\n\n⏹️ (중지됨)`,
                  createdAt: new Date().toISOString(),
                },
              ]);
            }
            break;
          case "error":
            turnStore.update(conversationId, { error: event.message });
            break;
          // thinking 은 아직 화면에 쓰지 않는다.
        }
      }
    } catch (err) {
      turnStore.update(conversationId, { error: err instanceof Error ? err.message : String(err) });
    } finally {
      // 오류는 남긴다 — 방을 떠난 사이 실패했어도 돌아와서 볼 수 있어야 한다.
      turnStore.update(conversationId, { streaming: null, tool: null, turnId: null });
      // 목록의 제목·마지막 메시지·정렬을 갱신한다.
      onTurnEnd?.();
    }
  };

  const stop = () => {
    if (turnId) cancelChat(turnId);
  };

  return { messages, streaming, tool, error, send, stop };
}
