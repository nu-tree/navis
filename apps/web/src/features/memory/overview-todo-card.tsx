"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemoryTodoList } from "@/hooks/apis/memory/use-memory-todo-list";
import { useUpdateMemory } from "@/hooks/apis/memory/use-update-memory";
import { cn } from "cn";
import { OverviewCard } from "./overview-card";

/** 카드에 보일 개수. 나머지는 "할 일 전체"로. */
const SHOWN = 4;

type Props = { onMore: () => void; className?: string };

/** 남은 할 일 — 여기서 바로 체크해 끝낸다. 할 일 탭과 같은 조회라 캐시를 나눠 쓴다(todo-list.tsx). */
export const OverviewTodoCard = ({ onMore, className }: Readonly<Props>) => {
  const { data: todos = [], isLoading } = useMemoryTodoList({ includeDone: false, limit: 200 });
  const { mutate: updateMemory, isPending, variables } = useUpdateMemory({ successMessage: null });
  const rest = todos.length - SHOWN;

  return (
    <OverviewCard
      label={isLoading ? "남은 할 일" : `남은 할 일 ${todos.length}`}
      action={{ label: rest > 0 ? `${rest}개 더` : "할 일 전체", onClick: onMore }}
      className={className}
    >
      {isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : todos.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          남은 할 일이 없어요. 대화 중에 &ldquo;할 일로 기억해&rdquo;라고 하면 여기 쌓여요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todos.slice(0, SHOWN).map((todo) => {
            const done = isPending && variables?.id === todo.id ? (variables.done ?? false) : todo.done === true;
            return (
              <li key={todo.id} className="flex items-start gap-3 rounded-xl border border-border bg-background/60 px-3.5 py-3">
                <Checkbox
                  aria-label={done ? "미완료로 되돌리기" : "완료"}
                  checked={done}
                  onCheckedChange={(v) => updateMemory({ id: todo.id, done: v === true })}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("line-clamp-2 text-sm leading-relaxed break-words", done && "text-muted-foreground line-through")}>
                    {todo.content}
                  </p>
                  {todo.project ? <p className="mt-1 text-xs text-muted-foreground">{todo.project}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
};
