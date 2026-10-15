"use client";

import { RotateCw } from "lucide-react";
import type { RelayItem, RelayStatus } from "@navis/validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS: Record<RelayStatus, { text: string; variant: "secondary" | "outline" | "default" | "destructive" }> = {
  pending: { text: "대기", variant: "outline" },
  running: { text: "전하는 중", variant: "secondary" },
  delivered: { text: "전함", variant: "default" },
  failed: { text: "실패", variant: "destructive" },
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

type Props = {
  items: RelayItem[];
  isLoading: boolean;
  error: Error | null;
  onResend: (item: RelayItem) => void;
};

/**
 * 보낸 기록 — 받는 사람 · 전할 말 · 시각 · 결과. 나비스가 지은 문장은 여기 없다(specs/004 FR-019) —
 * 받는 사람에게 간 말은 그 사람의 대화다.
 */
export const RelayList = ({ items, isLoading, error, onResend }: Readonly<Props>) => {
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">아직 보낸 말이 없어요.</p>;

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="space-y-1.5 rounded-xl border border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{item.to}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatTime(item.createdAt)}</span>
            <Badge variant={STATUS[item.status].variant}>{STATUS[item.status].text}</Badge>
          </div>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{item.instruction}</p>
          {item.status === "failed" ? (
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-xs text-destructive">{item.error}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => onResend(item)}>
                <RotateCw />
                다시 보내기
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
};
