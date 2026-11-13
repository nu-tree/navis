"use client";

import { useState } from "react";
import { TOPIC_MAX } from "@navis/validation";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 고치기면 지금 주제. 없으면 새 방 만들기. */
  initialTopic?: string;
  pending?: boolean;
  onSubmit: (topic: string) => void;
};

/**
 * 주제 방 만들기 · 주제 고치기 창. 주제는 자유롭게 쓴다 — '강의 준비'도 '안녕'도 된다.
 * 나비스는 주제를 보고 기억에 초점만 맞추고 걸러내지는 않는다(2026-11-13 결정). 그걸 설명에 밝힌다.
 */
export function TopicDialog({ open, onOpenChange, initialTopic, pending, onSubmit }: Readonly<Props>) {
  const editing = initialTopic !== undefined;
  const [topic, setTopic] = useState(initialTopic ?? "");
  const trimmed = topic.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 다시 열 때 지난 입력이 남지 않게.
        if (next) setTopic(initialTopic ?? "");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) onSubmit(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "주제 고치기" : "새 주제 방"}</DialogTitle>
            <DialogDescription>
              이 방에서 무슨 얘기를 할지 적어 주세요. 나비스가 주제에 맞춰 기억을 먼저 떠올려요. 다른 기억도 필요하면
              그대로 꺼내 써요.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="주제"
            placeholder="예: 강의 준비, 이사, 안녕"
            value={topic}
            maxLength={TOPIC_MAX}
            onChange={(e) => setTopic(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={!trimmed || pending}>
              {editing ? "바꾸기" : "만들기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
