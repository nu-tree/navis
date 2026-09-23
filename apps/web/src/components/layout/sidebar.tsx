"use client";

import { Brain, LogOut, MessageSquare, Plus, Settings, Trash2 } from "lucide-react";
import type { ConversationSummary } from "@navis/validation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/use-auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

type Props = {
  rooms: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
};

export function NavisSidebar({
  rooms,
  selectedId,
  onSelect,
  onCreate,
  onRemove,
}: Readonly<Props>) {
  const { signOut, configured } = useAuth();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1 text-lg font-extrabold">
          나비스
        </div>

        <Button
          variant="outline"
          onClick={onCreate}
          className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Plus />
          <span className="group-data-[collapsible=icon]:hidden">새 대화</span>
        </Button>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>대화</SidebarGroupLabel>
          <SidebarMenu>
            {rooms.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                아직 대화가 없어요.
              </p>
            ) : null}

            {rooms.map((room) => (
              <SidebarMenuItem key={room.id}>
                <SidebarMenuButton
                  isActive={room.id === selectedId}
                  tooltip={room.title}
                  onClick={() => onSelect(room.id)}
                >
                  <MessageSquare />
                  <span>{room.title}</span>
                </SidebarMenuButton>

                {/* 안읽음 배지는 두지 않는다 — 계약(ConversationSummary)에 없고,
                    기기 간 동기화를 가져오지 않기로 하면서 의미를 잃었다. */}
                <SidebarMenuAction
                  showOnHover
                  aria-label={`${room.title} 삭제`}
                  onClick={() => onRemove(room.id)}
                >
                  <Trash2 />
                </SidebarMenuAction>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="기억">
              <Brain />
              <span>기억</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="설정">
              <Settings />
              <span>설정</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* 로그인을 켜지 않은 로컬 개발 상태에서는 보여주지 않는다 — 누를 수
              있는데 아무 일도 안 일어나는 버튼은 고장으로 보인다. */}
          {configured ? (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="로그아웃" onClick={() => void signOut()}>
                <LogOut />
                <span>로그아웃</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
