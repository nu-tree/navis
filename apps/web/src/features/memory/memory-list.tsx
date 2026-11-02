"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BrowsedMemory } from "@/hooks/pages/memory/use-memory-browser";
import { groupByDay } from "@/utils/day-groups";
import { MemoryItem } from "./memory-item";
import { MemoryNeighbors } from "./memory-neighbors";

type Props = {
  items: BrowsedMemory[];
  isLoading: boolean;
  error: string | null;
  emptyText: string;
  /** 날짜별로 묶어 보인다 — 최신순 목록일 때. 의미 검색 결과는 관련도순이라 묶지 않는다. */
  byDay?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

export const MemoryList = ({
  items,
  isLoading,
  error,
  emptyText,
  byDay = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: Readonly<Props>) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <div className="space-y-3">
      {byDay ? (
        groupByDay(items, (i) => i.memory.createdAt).map((group) => (
          <section key={group.key} className="space-y-2">
            <h2 className="sticky top-0 z-10 bg-background/95 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
              {group.label} <span className="font-normal">· {group.items.length}</span>
            </h2>
            <MemoryItems items={group.items} />
          </section>
        ))
      ) : (
        <MemoryItems items={items} />
      )}
      {hasMore ? (
        <Button variant="outline" className="w-full" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "불러오는 중…" : "더 보기"}
        </Button>
      ) : null}
    </div>
  );
};

const MemoryItems = ({ items }: Readonly<{ items: BrowsedMemory[] }>) => (
  <ul className="space-y-2">
    {items.map(({ memory, score }) => (
      <MemoryItem key={memory.id} memory={memory} {...(score !== undefined ? { score } : {})}>
        <MemoryNeighbors memoryId={memory.id} />
      </MemoryItem>
    ))}
  </ul>
);
