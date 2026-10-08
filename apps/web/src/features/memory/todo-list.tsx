"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemoryTodoList } from "@/hooks/apis/memory/use-memory-todo-list";
import { useUpdateMemory } from "@/hooks/apis/memory/use-update-memory";
import { cn } from "cn";
import { MemoryMeta } from "./memory-meta";

/** 할 일 — 기본은 미완료만, 선택하면 완료도 함께(FR-026). 체크로 완료 토글(FR-027). */
export const TodoList = () => {
  const [includeDone, setIncludeDone] = useState(false);
  const { data: todos = [], isLoading, error } = useMemoryTodoList({ includeDone, limit: 200 });
  // 체크는 잦은 동작이라 성공 토스트를 띄우지 않는다. 실패만 알린다.
  const { mutate: updateMemory, isPending, variables } = useUpdateMemory({ successMessage: null });

  return (
    <div className="space-y-3">
      <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={includeDone} onCheckedChange={(v) => setIncludeDone(v === true)} />
        완료한 것도 보기
      </label>

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : todos.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {includeDone ? "할 일이 없어요." : "남은 할 일이 없어요."}
        </p>
      ) : (
        <ul className="space-y-2">
          {todos.map((todo) => {
            // 서버 응답 전에도 체크가 바로 바뀌어 보이게 — 요청 중인 값을 먼저 보여준다.
            const done = isPending && variables?.id === todo.id ? (variables.done ?? false) : todo.done === true;
            return (
              <li key={todo.id} className="flex items-start gap-3 rounded-xl border border-border bg-card/40 px-4 py-3">
                <Checkbox
                  aria-label={done ? "미완료로 되돌리기" : "완료"}
                  checked={done}
                  onCheckedChange={(v) => updateMemory({ id: todo.id, done: v === true })}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className={cn("text-sm break-words whitespace-pre-wrap", done && "text-muted-foreground line-through")}>
                    {todo.content}
                  </p>
                  <MemoryMeta memory={todo} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
