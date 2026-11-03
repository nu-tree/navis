"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useMemoryLatest } from "@/hooks/apis/memory/use-memory-latest";
import { whenLabel } from "@/utils/day-groups";
import { CATEGORY_COLORS } from "./category";
import { OverviewCard } from "./overview-card";

type Props = { onMore: () => void; className?: string };

/** 가장 최근 결정 하나를 크게 — "요즘 뭘 정했더라"에 바로 답한다. */
export const OverviewDecisionCard = ({ onMore, className }: Readonly<Props>) => {
  const { data, isLoading } = useMemoryLatest({ category: "decision", limit: 1 });
  const latest = data?.[0];

  return (
    <OverviewCard
      label="최근 결정"
      color={CATEGORY_COLORS.decision}
      action={{ label: "결정 전체", onClick: onMore }}
      className={className}
    >
      {isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : !latest ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          아직 결정한 게 없어요. 대화하다 &ldquo;이걸로 하자&rdquo;고 정하면 여기 남아요.
        </p>
      ) : (
        <>
          <p className="line-clamp-4 text-xl leading-snug font-semibold tracking-[-0.02em] break-words whitespace-pre-wrap md:text-2xl">
            {latest.content}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {latest.project ? <Chip>{latest.project}</Chip> : null}
            {latest.tags.slice(0, 3).map((tag) => (
              <Chip key={tag}>#{tag}</Chip>
            ))}
            <time dateTime={latest.createdAt} className="ml-auto font-mono">
              {whenLabel(new Date(latest.createdAt))}
            </time>
          </div>
        </>
      )}
    </OverviewCard>
  );
};

export const Chip = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <span className="inline-flex h-6 items-center rounded-md border border-input bg-muted px-2 text-xs text-foreground/75">
    {children}
  </span>
);
