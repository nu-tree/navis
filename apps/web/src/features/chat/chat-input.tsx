"use client";

import { useState } from "react";
import { ArrowUp, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";

type Props = React.HTMLAttributes<HTMLElement> & {
  onSend: (text: string) => void;
};

export const ChatInput = ({ onSend, className }: Readonly<Props>) => {
  const [draft, setDraft] = useState("");

  const trimmed = draft.trim();
  const canSend = trimmed.length > 0;

  const send = () => {
    if (!canSend) return;
    onSend(trimmed);
    setDraft("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // 한글 입력 중의 Enter 는 조합을 확정하는 키다. 여기서 보내면 마지막 글자가
    // 잘리거나 한 번 더 전송된다.
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    send();
  };

  return (
    <div className={cn("mx-auto w-full max-w-3xl px-4 pb-4", className)}>
      {/* 테두리·배경·포커스 표시는 이 컨테이너가 갖는다 — textarea 와 툴바가
          한 상자로 보여야 하므로. 그래서 안쪽 Textarea 의 chrome 은 상쇄한다. */}
      <div className="rounded-2xl border border-border bg-input transition-colors focus-within:border-ring/60">
        <Textarea
          rows={1}
          placeholder="무엇이든 물어보세요"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            // shadcn Textarea 는 독립 필드용이라 자기 테두리·배경·포커스링·min-h-16 을
            // 갖는다. 상자를 컨테이너가 그리므로 여기선 지운다.
            "min-h-0 resize-none rounded-none border-0 bg-transparent focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
            // field-sizing-content 는 Textarea 에 이미 있다 — 입력에 따라 자라고
            // max-h 에 닿으면 내부 스크롤로 넘어간다.
            "max-h-50 px-4 pt-3.5 pb-2 text-[15px] leading-relaxed",
          )}
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          <Button variant="ghost" size="icon-lg" aria-label="이미지 첨부">
            <ImagePlus className="size-4.5" />
          </Button>

          <div className="flex-1" />

          <Button
            size="icon-lg"
            aria-label="전송"
            disabled={!canSend}
            onClick={send}
          >
            <ArrowUp className="size-4.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
