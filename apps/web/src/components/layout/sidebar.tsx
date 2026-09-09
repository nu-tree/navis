"use client";

import { Brain, MessageSquare, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";

// 사이드바 내용. 지금은 골격이라 대화 목록이 자리만 잡고 있다 —
// 실제 목록은 도메인 배선 후 이 파일에서 conversation 목록을 받아 렌더한다.

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    // min-h-0 이 없으면 목록 영역이 부모를 넘어 자라서 자기 스크롤을 잃는다.
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex items-center gap-2 px-3 py-3.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
          <Brain className="size-4 text-primary-foreground" />
        </div>
        <span className="font-heading text-[15px] font-semibold tracking-tight">
          navis
        </span>
      </div>

      <div className="px-3 pb-2">
        <Button variant="outline" size="lg" className="w-full justify-start">
          <Plus />
          새 대화
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* 대화 목록 — 여기만 스크롤한다. 헤더/푸터는 고정. */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          대화
        </p>
        <ul className="space-y-0.5">
          {PLACEHOLDER_ROOMS.map((room) => (
            <li key={room.id}>
              <ConversationRow
                title={room.title}
                active={room.active}
                onClick={onNavigate}
              />
            </li>
          ))}
        </ul>
      </nav>

      <Separator className="bg-sidebar-border" />

      <div className="p-2">
        <SidebarLink icon={<Brain className="size-4" />} label="기억" />
        <SidebarLink icon={<Settings className="size-4" />} label="설정" />
      </div>
    </div>
  );
}

function ConversationRow({
  title,
  active,
  onClick,
}: {
  title: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <MessageSquare className="size-4 shrink-0 opacity-70" />
      {/* truncate 가 먹으려면 부모 flex 아이템에 min-w-0 이 필요하다. */}
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </button>
  );
}

function SidebarLink({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
      {icon}
      <span>{label}</span>
    </button>
  );
}

// 골격 확인용 더미. 배선 시 제거한다.
const PLACEHOLDER_ROOMS = [
  { id: "1", title: "리팩터링 계획 정리", active: true },
  { id: "2", title: "Tailwind v4 토큰 형식 질문" },
  { id: "3", title: "모노레포 의존 방향" },
  { id: "4", title: "이번 주에 배운 것들 정리해줘" },
];
