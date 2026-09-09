import type { ReactNode } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavisSidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider className="min-h-0 flex-1">
      <NavisSidebar />

      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
          {/* 데스크톱은 접기/펼치기, 모바일은 드로어 열기 — 한 버튼이 둘 다 한다. */}
          <SidebarTrigger />
          <div className="flex-1" />
        </header>

        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
