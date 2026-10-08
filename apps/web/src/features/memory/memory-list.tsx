"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BrowsedMemory } from "@/hooks/pages/memory/use-memory-browser";
import { MemoryItem } from "./memory-item";
import { MemoryNeighbors } from "./memory-neighbors";

type Props = {
  items: BrowsedMemory[];
  isLoading: boolean;
  error: string | null;
  emptyText: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

export const MemoryList = ({
  items,
  isLoading,
  error,
  emptyText,
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
      <ul className="space-y-2">
        {items.map(({ memory, score }) => (
          <MemoryItem key={memory.id} memory={memory} {...(score !== undefined ? { score } : {})}>
            <MemoryNeighbors memoryId={memory.id} />
          </MemoryItem>
        ))}
      </ul>
      {hasMore ? (
        <Button variant="outline" className="w-full" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "불러오는 중…" : "더 보기"}
        </Button>
      ) : null}
    </div>
  );
};
