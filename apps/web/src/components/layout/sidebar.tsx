"use client";

import { Brain, MessageSquare, Plus, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

export function NavisSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1 text-lg font-extrabold">
          나비스
        </div>

        <Button
          variant="outline"
          className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Plus />
          <span className="group-data-[collapsible=icon]:hidden">새 대화</span>
        </Button>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>채팅</SidebarGroupLabel>
          <SidebarMenu>
            {PLACEHOLDER_ROOMS.map((room) => (
              <SidebarMenuItem key={room.id}>
                <SidebarMenuButton isActive={room.active} tooltip={room.title}>
                  <MessageSquare />
                  <span>{room.title}</span>
                </SidebarMenuButton>

                {/* 안읽음 배지. 액션과 같은 자리라 둘이 겹치는데, 배지는
                    호버 시 액션에 자리를 내준다. */}
                {room.unread ? (
                  <SidebarMenuBadge className="group-hover/menu-item:hidden">
                    {room.unread}
                  </SidebarMenuBadge>
                ) : null}

                <SidebarMenuAction showOnHover aria-label="대화 삭제">
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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

// 골격 확인용 더미. 배선 시 제거한다.
const PLACEHOLDER_ROOMS = [
  { id: "1", title: "리팩터링 계획 정리", active: true, unread: 0 },
  { id: "2", title: "Tailwind v4 토큰 형식 질문", unread: 2 },
  { id: "3", title: "모노레포 의존 방향", unread: 0 },
  { id: "4", title: "이번 주에 배운 것들 정리해줘", unread: 0 },
];
