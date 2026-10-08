"use client";

import { useState } from "react";
import { CATEGORIES, type Category, type Memory, type UpdateInput } from "@navis/validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMemoryProjectList } from "@/hooks/apis/memory/use-memory-project-list";
import { useUpdateMemory } from "@/hooks/apis/memory/use-update-memory";
import { CATEGORY_LABELS } from "./category";

type Props = {
  memory: Memory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const parseTags = (raw: string) =>
  raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/**
 * 기억 수정 — 내용 · 분류 · 프로젝트 · 태그(FR-023). 내용을 고치면 서버가 재임베딩한다(FR-024).
 * 바뀐 필드만 보낸다 — 안 바뀐 내용을 보내도 서버가 재임베딩을 건너뛰지만, 의도를 분명히 한다.
 */
export const MemoryEditor = ({ memory, open, onOpenChange }: Readonly<Props>) => {
  const { data: projects = [] } = useMemoryProjectList();
  const { mutate: updateMemory, isPending } = useUpdateMemory();

  const [content, setContent] = useState(memory.content);
  const [category, setCategory] = useState<Category | undefined>(memory.category ?? undefined);
  const [project, setProject] = useState(memory.project ?? "");
  const [tags, setTags] = useState(memory.tags.join(", "));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextTags = parseTags(tags);
    const patch: UpdateInput = {
      id: memory.id,
      ...(content.trim() !== memory.content ? { content: content.trim() } : {}),
      ...(category && category !== memory.category ? { category } : {}),
      // 빈 문자열이면 서버가 개인 기억으로 되돌린다.
      ...(project.trim() !== (memory.project ?? "") ? { project: project.trim() } : {}),
      ...(nextTags.join(",") !== memory.tags.join(",") ? { tags: nextTags } : {}),
    };
    if (Object.keys(patch).length === 1) {
      onOpenChange(false);
      return;
    }
    updateMemory(patch, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>기억 고치기</DialogTitle>
            <DialogDescription>내용을 고치면 이후 검색과 대화에서도 고친 내용으로 찾습니다.</DialogDescription>
          </DialogHeader>

          <Textarea
            aria-label="내용"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            className="min-h-28"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger aria-label="분류" className="w-full">
                <SelectValue placeholder="분류 없음" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 기존 표기를 고르게 해 'soopsns' · 'soop-sns' 처럼 갈라지지 않게 한다. */}
            <Input
              aria-label="프로젝트"
              placeholder="프로젝트 (비우면 개인)"
              list="memory-project-options"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
            <datalist id="memory-project-options">
              {projects.map((p) => (
                <option key={p.project} value={p.project} />
              ))}
            </datalist>
          </div>

          <Input
            aria-label="태그"
            placeholder="태그 (쉼표로 구분)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={isPending || !content.trim()}>
              {isPending ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
