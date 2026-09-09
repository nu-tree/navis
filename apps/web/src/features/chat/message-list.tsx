"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { Message } from "@navis/validation";
import { cn } from "cn";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";

// 바닥에서 이 거리 안에 있으면 "따라가는 중" 으로 본다.
const STICK_THRESHOLD_PX = 120;

export function MessageList({
  messages,
  streamingId,
  status,
  turnStartedAt,
  className,
}: {
  messages: Message[];
  /** 지금 스트리밍 중인 메시지 id. 그 버블에 커서를 띄운다. */
  streamingId?: string;
  status?: string;
  /** 응답 대기 시작 시각. 있으면 타이핑 표시를 띄운다. */
  turnStartedAt?: number;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(true);

  // ★ 스크롤 정책: 바닥을 따라가되, 사용자가 위로 올려 읽고 있으면 끌어내리지 않는다.
  // 이걸 무조건 scrollTo(bottom) 으로 하면 과거 대화를 읽는 동안 델타마다 바닥으로
  // 튕겨서 읽을 수가 없다.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStuck(distance < STICK_THRESHOLD_PX);
  };

  // useLayoutEffect: 페인트 전에 스크롤을 맞춰 한 프레임짜리 점프를 없앤다.
  useLayoutEffect(() => {
    if (!stuck) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status, stuck]);

  // 처음 마운트 시엔 애니메이션 없이 바닥에서 시작한다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    setStuck(true);
  };

  return (
    <div className={cn("relative min-h-0 flex-1", className)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              streaming={m.id === streamingId}
            />
          ))}
          {/* 응답이 시작되기 전(아직 어시스턴트 버블이 없는) 구간의 표시 */}
          {turnStartedAt !== undefined && streamingId === undefined && (
            <TypingIndicator status={status} startedAt={turnStartedAt} />
          )}
        </div>
      </div>

      {/* 위로 올려 읽는 중일 때만 바닥으로 가는 길을 준다. */}
      {!stuck && (
        <button
          onClick={scrollToBottom}
          aria-label="맨 아래로"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface p-2 text-muted-foreground shadow-lg transition-colors hover:text-foreground"
        >
          <ArrowDown className="size-4" />
        </button>
      )}
    </div>
  );
}
