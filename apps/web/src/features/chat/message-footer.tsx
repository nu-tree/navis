"use client";

import { useState } from "react";
import { BookOpen, Brain, ChevronDown, Coins, Trash2 } from "lucide-react";
import type { Message, MessageUsage } from "@navis/validation";
import { cn } from "cn";
import { CopyButton } from "@/components/common/copy-button";
import { CATEGORY_LABELS } from "@/features/memory/category";

type Props = { message: Message; onRemove: () => void };

/** 1234 → "1.2k". 천 아래는 그대로. */
const formatTokens = (n: number) =>
  n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;

/**
 * 이 질문으로 새로 쓴 양 — 새 입력(캐시에 쓰며 읽은 것 포함) + 출력. 캐시에서 다시 읽은 앞부분은 뺀다
 * (validation 의 messageUsageSchema 주석).
 */
const freshTokens = (u: MessageUsage) => u.input + u.cacheWrite + u.output;

type Open = "memories" | "usage" | null;

/**
 * 나비스 말풍선 아래 한 줄 — 복사 · 기억 저장 · 참고한 기억 · 쓴 토큰 · 삭제. 누르면 그 아래 내역이 펼쳐진다.
 * 복사는 마크다운 원문 그대로(붙여 넣는 곳에서 서식이 살게). 버튼은 hover 없이 늘 보인다 — 터치 기기에는 hover 가 없다.
 * 나머지는 메시지가 들고 온 값으로만 판단한다. 이 기능 전의 메시지에는 참고 기억 · 토큰이 없어 그리지 않는다.
 */
export const MessageFooter = ({ message, onRemove }: Readonly<Props>) => {
  const [open, setOpen] = useState<Open>(null);
  const { saved, usage, memoriesUsed } = message;
  const toggle = (which: Exclude<Open, null>) => setOpen((cur) => (cur === which ? null : which));
  const chip =
    "flex items-center gap-1 rounded-md px-1 -mx-1 hover:text-foreground focus-visible:text-foreground";

  return (
    <div className="mt-1 max-w-[85%] text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CopyButton text={message.text} className="-ml-1.5 size-7 text-muted-foreground [&_svg]:size-3.5" />
        {saved ? (
          <span className="flex items-center gap-1.5">
            <Brain className="size-3.5" />
            기억에 남겼어요
          </span>
        ) : null}

        {memoriesUsed ? (
          <button type="button" aria-expanded={open === "memories"} onClick={() => toggle("memories")} className={chip}>
            <BookOpen className="size-3.5" />
            기억 {memoriesUsed.total}건 참고
            <ChevronDown className={cn("size-3 transition-transform", open === "memories" && "rotate-180")} />
          </button>
        ) : null}

        {usage ? (
          <button type="button" aria-expanded={open === "usage"} onClick={() => toggle("usage")} className={cn(chip, "tabular-nums")}>
            <Coins className="size-3.5" />
            {formatTokens(freshTokens(usage))} 토큰
            <ChevronDown className={cn("size-3 transition-transform", open === "usage" && "rotate-180")} />
          </button>
        ) : null}

        {/* 맨 끝에 둔다 — 복사를 누르려다 지우지 않게 멀리. */}
        <button type="button" aria-label="메시지 삭제" onClick={onRemove} className="ml-auto rounded-md p-1.5 hover:text-destructive focus-visible:text-destructive">
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {open === "memories" && memoriesUsed ? (
        <ul className="mt-2 space-y-1.5 border-l-2 border-border pl-2.5">
          {memoriesUsed.items.map((m) => (
            <li key={m.id}>
              <span className="text-foreground/90">{m.content}</span>
              <span className="ml-1.5 whitespace-nowrap">
                {[m.createdAt.slice(0, 10), m.category ? CATEGORY_LABELS[m.category] : null, m.project]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
          {memoriesUsed.total > memoriesUsed.items.length ? (
            <li>외 {memoriesUsed.total - memoriesUsed.items.length}건</li>
          ) : null}
        </ul>
      ) : null}

      {open === "usage" && usage ? (
        <div className="mt-2 space-y-1 border-l-2 border-border pl-2.5 tabular-nums">
          <p>
            새 입력 {(usage.input + usage.cacheWrite).toLocaleString()} · 출력 {usage.output.toLocaleString()} · 캐시
            재사용 {usage.cacheRead.toLocaleString()}
          </p>
          {/* 캐시 재사용이 왜 큰지 묻게 된다 — 한 줄로 답해 둔다. */}
          <p>캐시 재사용: 매 질문마다 다시 보내는 설정 · 도구 설명 · 이전 대화를 캐시에서 읽은 양</p>
        </div>
      ) : null}
    </div>
  );
};
