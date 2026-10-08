"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteMemory } from "@/hooks/apis/memory/use-delete-memory";
import { useMemoryNeighborList } from "@/hooks/apis/memory/use-memory-neighbor-list";
import { ConfirmDeleteButton } from "./confirm-delete-button";
import { MemoryMeta } from "./memory-meta";

/** 이 점수 이상이면 "겹친다"로 강조한다. 임베딩 모델이 바뀌면 다시 본다. */
const OVERLAP_SCORE = 0.8;

type Props = { memoryId: string };

/**
 * 펼친 기억의 이웃 — 겹치는 기억을 나란히 보고, 남길 것만 두고 지운다(FR-047, R7).
 * 펼쳤을 때만 마운트되므로 그때만 조회한다.
 */
export const MemoryNeighbors = ({ memoryId }: Readonly<Props>) => {
  const { data: hits = [], isLoading, error } = useMemoryNeighborList(memoryId, true);
  const { mutate: deleteMemory, isPending } = useDeleteMemory();

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (error) return <p className="text-xs text-destructive">{error.message}</p>;
  if (hits.length === 0) return <p className="text-xs text-muted-foreground">비슷한 기억이 없어요.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">비슷한 기억 — 겹치면 지우고 하나만 남기세요</p>
      <ul className="space-y-2">
        {hits.map(({ memory, score }) => (
          <li
            key={memory.id}
            data-overlap={score >= OVERLAP_SCORE || undefined}
            className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 data-overlap:border-primary/40"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm break-words whitespace-pre-wrap">{memory.content}</p>
              <MemoryMeta memory={memory} score={score} />
            </div>
            <ConfirmDeleteButton disabled={isPending} onConfirm={() => deleteMemory(memory.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
};
