"use client";

import { memo, useState } from "react";
import { Check, ChevronRight, Copy, Wrench } from "lucide-react";
import type { Message } from "@navis/validation";
import { cn } from "cn";
import { MarkdownText } from "./markdown-text";

// ★ memo 가 여기서는 장식이 아니다.
// 스트리밍 중에는 마지막 메시지의 text 만 매 델타마다 바뀐다. memo 가 없으면 델타
// 하나에 목록 전체가 리렌더되고, 각 버블이 마크다운을 다시 파싱한다 — 대화가 길어질수록
// 타이핑이 눈에 보이게 끊긴다. (Next 16 은 React Compiler 를 기본 활성하지 않으므로
// 자동 메모이제이션에 기대면 안 된다.)
export const MessageBubble = memo(function MessageBubble({
  message,
  streaming = false,
}: {
  message: Message;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("group flex flex-col gap-1.5", isUser && "items-end")}>
      {/* 사용자는 말풍선, 어시스턴트는 전문(全幅) 텍스트.
          긴 마크다운을 좁은 버블에 넣으면 코드블록·표가 읽히지 않는다. */}
      <div
        className={cn(
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground"
            : "w-full text-foreground",
        )}
      >
        {message.images && message.images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                className="max-h-48 rounded-xl border border-border object-cover"
              />
            ))}
          </div>
        )}

        {isUser ? (
          // 사용자 입력은 마크다운으로 해석하지 않는다 — 의도 없이 쓴 `*`·`#` 가
          // 서식으로 바뀌면 원문이 왜곡된다. 줄바꿈만 보존.
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {message.text}
          </p>
        ) : (
          <>
            {message.toolsUsed && message.toolsUsed.length > 0 && (
              <ToolTrace tools={message.toolsUsed} defaultOpen={streaming} />
            )}
            <MarkdownText text={message.text} />
            {streaming && <Caret />}
          </>
        )}
      </div>

      {!streaming && <BubbleActions text={message.text} isUser={isUser} />}
    </div>
  );
});

// 스트리밍 중 커서. 텍스트가 흐르고 있다는 걸 보여준다.
function Caret() {
  return (
    <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-foreground" />
  );
}

// 도구 사용 내역. 접힌 상태가 기본이고 스트리밍 중에는 펼쳐 둔다 —
// 진행 중일 때는 무슨 일이 일어나는지 보고 싶고, 끝난 뒤에는 답만 보고 싶다.
function ToolTrace({
  tools,
  defaultOpen,
}: {
  tools: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Wrench className="size-3.5" />
        <span>작업 {tools.length}개</span>
        <ChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
          {tools.map((t, i) => (
            <li key={i} className="text-[13px] text-muted-foreground">
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 호버 시 나타나는 복사 버튼. 항상 보이면 시각적 잡음이 된다.
function BubbleActions({ text, isUser }: { text: string; isUser: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드는 권한·비보안 컨텍스트에서 거부될 수 있다. 조용히 무시 —
      // 복사 실패로 에러를 띄울 만한 일이 아니다.
    }
  };

  return (
    <div
      className={cn(
        "flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
        isUser && "justify-end",
      )}
    >
      <button
        onClick={copy}
        aria-label="복사"
        title="복사"
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}
