import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

type Props = {
  /** 왼쪽 사이드바. 슬롯으로 받는다 — 셸이 목록의 상태를 알 필요가 없다. */
  sidebar: ReactNode;
  children: ReactNode;
};

export function AppShell({ sidebar, children }: Readonly<Props>) {
  return (
    <SidebarProvider className="flex-1">
      {sidebar}

      {/* 목록만 스크롤하고 입력창은 바닥에 고정되려면 이 열의 높이가 화면에
          묶여야 한다 — min-h-0 이 없으면 내용만큼 늘어난다. */}
      <SidebarInset className="min-h-0">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
          {/* 데스크톱은 접기/펼치기, 모바일은 드로어 열기 — 한 버튼이 둘 다 한다. */}
          <SidebarTrigger />
        </header>

        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
