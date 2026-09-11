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
        // 처음 여는 사용자가 안내 없이 첫 기억을 남기게 해야 한다(SC-012).
        // "무엇을 도와드릴까요?" 만으로는 이게 기억하는 도구라는 걸 알 수 없다.
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4">
          <div className="space-y-1.5 text-center">
            <p className="text-lg font-medium">무엇을 도와드릴까요?</p>
            <p className="text-sm text-muted-foreground">
              말한 것 중 기억할 만한 건 알아서 남겨둬요.
            </p>
          </div>

          <ul className="w-full max-w-md space-y-1.5 text-sm text-muted-foreground">
            {EMPTY_HINTS.map((hint) => (
              <li
                key={hint}
                className="rounded-lg border border-border/60 px-3 py-2"
              >
                {hint}
              </li>
            ))}
          </ul>
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

// 첫 화면의 예시. 저장(첫째·둘째)과 불러오기(셋째)를 각각 한 번 보여줘서
// 이 도구가 무엇을 하는지 한눈에 알게 한다.
const EMPTY_HINTS = [
  "이번 분기엔 나비스에 집중하기로 했어",
  "장 볼 것: 세탁세제, 건조대",
  "내가 배포 관련해서 뭐라고 했었지?",
];
