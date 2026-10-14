"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, CircleHelp, Download, LogOut, Settings } from "lucide-react";
import { useSignOut } from "@/hooks/apis/auth/use-sign-out";
import { InstallGuideDialog } from "@/features/install/install-guide-dialog";
import { useInstallPrompt, useStandalone } from "@/hooks/common/use-install-prompt";
import { supabaseEnv } from "@/lib/supabase";
import { useOnboardingStore } from "@/store/onboarding-store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

/**
 * 사이드바 — 기억 · 설정 · 설치 · 도움말. 방 목록과 "새 대화"는 없다: 대화는 "나비스" 방 하나로
 * 이어진다(2026-10-14 사용자 결정, use-conversation-workspace 주석).
 */
export function NavisSidebar() {
  const { mutate: signOut } = useSignOut();
  const openOnboarding = useOnboardingStore((s) => s.setOpen);
  const configured = supabaseEnv() !== null;
  const install = useInstallPrompt();
  const standalone = useStandalone();
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1 text-lg font-extrabold">
          나비스
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* 비어 있어도 둔다 — 푸터를 바닥으로 밀어내는 자리다. */}
      <SidebarContent />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="기억" data-tour="memories">
              <Link href="/memories">
                <Brain />
                <span>기억</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* 설치한 앱 창 안이 아니면 늘 보인다. 크롬 · 엣지는 바로 설치 창을 띄우고, 설치 창을 못 띄우는
              브라우저(사파리 · 파이어폭스 등)는 그 기기에 맞는 설치 방법을 보여준다. */}
          {standalone ? null : (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="앱으로 설치"
                onClick={async () => {
                  if (!install || !(await install())) setGuideOpen(true);
                }}
              >
                <Download />
                <span>앱으로 설치</span>
              </SidebarMenuButton>
              <InstallGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="사용법" data-tour="help" onClick={() => openOnboarding(true)}>
              <CircleHelp />
              <span>사용법</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="설정" data-tour="settings">
              <Link href="/settings">
                <Settings />
                <span>설정</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* 로그인을 켜지 않은 로컬 개발 상태에서는 보여주지 않는다 — 누를 수
              있는데 아무 일도 안 일어나는 버튼은 고장으로 보인다. */}
          {configured ? (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="로그아웃" onClick={() => signOut()}>
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
