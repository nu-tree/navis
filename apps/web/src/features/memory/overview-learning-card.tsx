"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useMemoryLatest } from "@/hooks/apis/memory/use-memory-latest";
import { whenLabel } from "@/utils/day-groups";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "./category";
import { CategoryDot, OverviewCard } from "./overview-card";

const SHOWN = 3;

type Props = { onMore: () => void; className?: string };

/** 최근에 알게 된 것 · 떠올린 것 — 배움과 아이디어를 섞어 최신 몇 개. */
export const OverviewLearningCard = ({ onMore, className }: Readonly<Props>) => {
  const learning = useMemoryLatest({ category: "learning", limit: SHOWN });
  const idea = useMemoryLatest({ category: "idea", limit: SHOWN });
  const isLoading = learning.isLoading || idea.isLoading;
  const items = [...(learning.data ?? []), ...(idea.data ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, SHOWN);

  return (
    <OverviewCard label="최근 알게 된 것" action={{ label: "배움 전체", onClick: onMore }} className={className}>
      {isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : items.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          아직 없어요. 대화하다 새로 알게 된 것 · 떠오른 생각이 여기 쌓여요.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((m) => (
            <li key={m.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <p className="line-clamp-2 text-sm leading-relaxed break-words">{m.content}</p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {m.category ? (
                  <span className="flex items-center gap-1.5">
                    <CategoryDot color={CATEGORY_COLORS[m.category]} />
                    {CATEGORY_LABELS[m.category]}
                  </span>
                ) : null}
                <time dateTime={m.createdAt} className="font-mono">
                  {whenLabel(new Date(m.createdAt))}
                </time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
};
