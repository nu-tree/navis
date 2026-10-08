import type { Memory } from "@navis/validation";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import { CATEGORY_LABELS } from "./category";

type Props = { memory: Memory; score?: number } & React.HTMLAttributes<HTMLElement>;

/** 기억 한 줄 아래의 메타 — 날짜 · 분류 · 프로젝트 · 태그 · (검색이면) 유사도. */
export const MemoryMeta = ({ memory, score, className }: Readonly<Props>) => {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <time dateTime={memory.createdAt}>{memory.createdAt.slice(0, 10)}</time>
      {memory.category ? <Badge variant="secondary">{CATEGORY_LABELS[memory.category]}</Badge> : null}
      {memory.project ? <Badge variant="outline">{memory.project}</Badge> : null}
      {memory.tags.map((tag) => (
        <span key={tag}>#{tag}</span>
      ))}
      {score !== undefined ? <span className="ml-auto tabular-nums">유사도 {score.toFixed(2)}</span> : null}
    </div>
  );
};
