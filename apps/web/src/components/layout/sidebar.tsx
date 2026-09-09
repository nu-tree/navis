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

// navis 사이드바 — shadcn sidebar 프리미티브 위에 얹는다.
//
// 손으로 만들었던 버전을 버린 이유: 대화방에 필요한 것(안읽음 배지, 호버 액션,
// 로딩 스켈레톤)이 이미 프리미티브로 있고, 무엇보다 모바일 드로어가 Sheet(Radix
// Dialog)라 포커스 트랩·Escape 가 공짜로 해결된다. 손수 오버레이는 그게 없었다.
//
// 지금은 골격이라 목록이 더미다. 배선 시 PLACEHOLDER_ROOMS 를 props 로 교체한다.

export function NavisSidebar() {
  return (
    // collapsible="icon": 접으면 사라지지 않고 아이콘 레일로 남는다.
    // 대화 전환이 잦은 화면이라 완전히 숨기는 offcanvas 보다 이게 낫다.
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Brain className="size-4 text-primary-foreground" />
          </div>
          {/* 아이콘 모드에서는 이름을 숨긴다 — 폭이 3rem 밖에 없다. */}
          <span className="font-heading text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            navis
          </span>
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
          <SidebarGroupLabel>대화</SidebarGroupLabel>
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
