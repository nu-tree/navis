"use client";

import { useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import type { Memory } from "@navis/validation";
import { Button } from "@/components/ui/button";
import { useDeleteMemory } from "@/hooks/apis/memory/use-delete-memory";
import { cn } from "cn";
import { ConfirmDeleteButton } from "./confirm-delete-button";
import { MemoryEditor } from "./memory-editor";
import { MemoryMeta } from "./memory-meta";

type Props = {
  memory: Memory;
  /** 검색 결과일 때의 유사도. */
  score?: number;
  /**
   * 펼쳤을 때 아래에 보일 것(이웃 목록). children 으로 받는다 — 항목이 이웃 조회를 알 필요가
   * 없고, 목록이 이웃 상태를 props 로 흘리지 않는다(헌장 원칙 V). 펼쳤을 때만 마운트된다.
   */
  children?: React.ReactNode;
};

export const MemoryItem = ({ memory, score, children }: Readonly<Props>) => {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const { mutate: deleteMemory, isPending } = useDeleteMemory();

  return (
    <li className="rounded-xl border border-border bg-card/40 px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* 접혀 있으면 4줄까지만 — 긴 기억 하나가 화면을 다 차지하지 않게. */}
          <p className={cn("text-sm leading-relaxed break-words whitespace-pre-wrap", !expanded && "line-clamp-4")}>
            {memory.content}
          </p>
          <MemoryMeta memory={memory} {...(score !== undefined ? { score } : {})} />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label="고치기" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <ConfirmDeleteButton disabled={isPending} onConfirm={() => deleteMemory(memory.id)} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={expanded ? "접기" : "비슷한 기억 보기"}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
          </Button>
        </div>
      </div>

      {expanded && children ? <div className="mt-3 border-t border-border/60 pt-3">{children}</div> : null}

      {/* 열 때마다 새로 마운트해 입력칸이 지금 기억의 값으로 시작하게 한다. */}
      {editing ? <MemoryEditor memory={memory} open={editing} onOpenChange={setEditing} /> : null}
    </li>
  );
};
