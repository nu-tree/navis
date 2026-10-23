"use client";

import type { FeedbackItem } from "@navis/validation";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

type Props = {
  items: FeedbackItem[];
  isLoading: boolean;
  error: Error | null;
  onToggle: (item: FeedbackItem, done: boolean) => void;
};

/** 피드백 목록 — 보낸 사람 · 시각 · 내용 · 처리함. 처리한 것은 흐리게 둔다. */
export const FeedbackList = ({ items, isLoading, error, onToggle }: Readonly<Props>) => {
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">아직 온 피드백이 없어요.</p>;

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn("space-y-1.5 rounded-xl border border-border px-4 py-3", item.done && "opacity-60")}
        >
          <div className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{item.from}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatTime(item.createdAt)}</span>
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={item.done} onCheckedChange={(v) => onToggle(item, v === true)} />
              처리함
            </label>
          </div>
          <p className="text-sm whitespace-pre-wrap">{item.text}</p>
        </li>
      ))}
    </ul>
  );
};
