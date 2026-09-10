"use client";

import { useEffect, useRef } from "react";
import { ChatInput } from "./chat-input";
import { MessageBubble } from "./message-bubble";
import { MessageList } from "./message-list";
import { TypingIndicator } from "./typing-indicator";
import { useChat } from "./use-chat";

export const ChatPanel = () => {
  const { messages, streaming, tool, error, send, stop } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지·델타는 항상 바닥에 붙는다. 그려진 뒤 내려야 하므로 effect 에서.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const busy = streaming !== null;
  const empty = messages.length === 0 && !busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {empty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <p className="text-lg text-muted-foreground">무엇을 도와드릴까요?</p>
        </div>
      ) : (
        <MessageList ref={scrollRef} messages={messages}>
          {/* 스트리밍 중인 답변. 확정되면 done 이벤트가 messages 로 옮긴다. */}
          {streaming ? (
            <MessageBubble
              message={{
                id: "streaming",
                role: "assistant",
                text: streaming,
                createdAt: "",
              }}
            />
          ) : null}

          {/* 첫 토큰 전 — 빈 말풍선 대신 진행 표시를 보여준다. */}
          {busy && !streaming ? <TypingIndicator label={tool ?? undefined} /> : null}

          {error ? (
            <p className="text-sm text-destructive">⚠️ {error}</p>
          ) : null}
        </MessageList>
      )}

      <ChatInput busy={busy} onSend={send} onStop={stop} />
    </div>
  );
};
