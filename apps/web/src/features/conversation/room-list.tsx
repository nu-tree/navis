"use client";

import { useState } from "react";
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import type { ConversationSummary } from "@navis/validation";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateConversation } from "@/hooks/apis/conversation/use-create-conversation";
import { useDeleteConversation } from "@/hooks/apis/conversation/use-delete-conversation";
import { useUpdateConversationTopic } from "@/hooks/apis/conversation/use-update-conversation-topic";
import { TopicDialog } from "./topic-dialog";

type Props = {
  rooms: readonly ConversationSummary[];
  currentId: string | null;
  onSelect: (id: string) => void;
};

/**
 * 방 목록 — 맨 위 "나비스"(메인) 방, 그 아래 주제 방들(최근 대화순). 데스크탑 사이드바와 모바일 서랍이 같이 쓴다.
 *
 * 주제가 없는 예전 방은 보이지 않는다 — 2026-10-14 에 숨긴 방들이다(운영에는 0개).
 */
export function RoomList({ rooms, currentId, onSelect }: Readonly<Props>) {
  const main = rooms.find((r) => r.isMain);
  const topicRooms = rooms.filter((r) => !r.isMain && r.topic);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  const create = useCreateConversation();
  const update = useUpdateConversationTopic();
  const remove = useDeleteConversation();

  const row = (active: boolean) =>
    cn(
      "flex min-h-13 w-full min-w-0 items-center gap-3 rounded-[10px] px-3.5 py-1.5 text-left transition-colors",
      active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-secondary/60 px-3.5 text-[14.5px] font-medium transition-colors hover:bg-secondary"
      >
        <Plus className="size-4.5 text-primary" />새 주제 방
      </button>

      <nav aria-label="대화방" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {main ? (
          <div className="flex flex-col gap-0.5">
            <div className="px-3.5 pb-1.5 text-xs font-medium tracking-[0.02em] text-muted-foreground">메인</div>
            <button
              type="button"
              aria-current={main.id === currentId ? "page" : undefined}
              onClick={() => onSelect(main.id)}
              className={row(main.id === currentId)}
            >
              <span className="flex w-4 shrink-0 justify-center" aria-hidden>
                <span className={cn("size-1.5 rounded-full", main.id === currentId ? "bg-primary" : "bg-muted-foreground/50")} />
              </span>
              <span className="flex min-w-0 flex-col leading-snug">
                <span className="text-[14.5px] font-medium">나비스</span>
                <span className="truncate text-xs text-muted-foreground">기본 대화 · 전하기</span>
              </span>
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-0.5">
          <div className="px-3.5 pb-1.5 text-xs font-medium tracking-[0.02em] text-muted-foreground">주제 방</div>
          {topicRooms.length === 0 ? (
            <p className="px-3.5 text-xs leading-relaxed text-muted-foreground">
              주제마다 방을 따로 만들 수 있어요. 약속은 만든 방으로 와요.
            </p>
          ) : null}
          {topicRooms.map((room) => {
            const active = room.id === currentId;
            return (
              <div key={room.id} className="group relative">
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect(room.id)}
                  className={cn(row(active), "pr-10")}
                >
                  <span className="flex w-4 shrink-0 justify-center" aria-hidden>
                    <span className={cn("size-1.5 rounded-full", active ? "bg-primary" : "bg-muted-foreground/50")} />
                  </span>
                  <span className="flex min-w-0 flex-col leading-snug">
                    <span className="truncate text-[14.5px] font-medium">{room.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{room.lastMessage ?? "아직 대화가 없어요"}</span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${room.title} 방 메뉴`}
                      className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(room)}>
                      <Pencil />
                      주제 고치기
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(room)}>
                      <Trash2 />방 지우기
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </nav>

      <TopicDialog
        open={creating}
        onOpenChange={setCreating}
        pending={create.isPending}
        onSubmit={(topic) =>
          create.mutate(topic, {
            onSuccess: (room) => {
              setCreating(false);
              onSelect(room.id);
            },
          })
        }
      />
      {editing ? (
        <TopicDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          initialTopic={editing.topic ?? editing.title}
          pending={update.isPending}
          onSubmit={(topic) => update.mutate({ id: editing.id, topic }, { onSuccess: () => setEditing(null) })}
        />
      ) : null}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{`'${deleting?.title ?? ""}' 방을 지울까요?`}</DialogTitle>
            <DialogDescription>
              이 방의 대화는 지워지고 되돌릴 수 없어요. 이 방에서 남긴 기억은 그대로 있고, 이 방의 약속은 앞으로 나비스 방으로
              와요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (!deleting) return;
                const id = deleting.id;
                remove.mutate(id, {
                  onSuccess: () => {
                    setDeleting(null);
                    // 보고 있던 방을 지웠으면 메인 방으로.
                    if (id === currentId && main) onSelect(main.id);
                  },
                });
              }}
            >
              지우기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
