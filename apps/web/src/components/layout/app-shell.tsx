import type { ReactNode } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavisSidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider className="flex-1">
      <NavisSidebar />

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
