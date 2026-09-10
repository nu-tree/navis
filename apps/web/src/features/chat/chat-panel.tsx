"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@navis/validation";
import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";

export const ChatPanel = () => {
  // 아직 서버가 없다 — 보낸 메시지는 이 화면에만 쌓인다.
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지는 항상 바닥에 붙는다. 목록이 그려진 뒤 내려야 하므로 effect 에서.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <p className="text-lg text-muted-foreground">무엇을 도와드릴까요?</p>
        </div>
      ) : (
        <MessageList ref={scrollRef} messages={messages} />
      )}

      <ChatInput onSend={handleSend} />
    </div>
  );
};
