"use client";

import { useState, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { Sidebar } from "./sidebar";

// ── 앱 셸 ────────────────────────────────────────────────────────────────────
// 사이드바 + 메인. 두 가지 모드로 동작한다:
//   데스크톱(md 이상) — 사이드바가 레이아웃을 차지하고, 접으면 폭이 0이 된다
//   모바일           — 사이드바가 오버레이 드로어로 떠서 메인을 밀지 않는다
//
// ★ min-h-0 / min-w-0 이 곳곳에 있는 이유:
// body 가 h-dvh + overflow-hidden 이고, 스크롤은 메시지 목록 안에서만 일어난다.
// flex 아이템의 기본 min-height 는 auto 라서, 내용이 크면 아이템이 부모를 넘어
// 자라고 그러면 안쪽 overflow-y-auto 가 스크롤할 게 없어진다(페이지가 대신 늘어남).
// min-h-0 을 줘야 아이템이 부모 크기로 잘리고 안쪽이 스크롤을 가져간다.
// 이건 flexbox 의 유명한 함정이고, 빠뜨리면 "왜 스크롤이 안 되지" 로 한참 헤맨다.

const SIDEBAR_WIDTH = "16rem"; // 256px

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1">
      {/* 데스크톱 사이드바 — 접으면 폭 0 + overflow-hidden 으로 사라진다.
          display:none 대신 폭을 애니메이션해 접힘이 눈에 보이게 한다. */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-r border-sidebar-border transition-[width] duration-200 md:block",
          collapsed ? "w-0 border-r-0" : "w-64",
        )}
        style={{ width: collapsed ? 0 : SIDEBAR_WIDTH }}
      >
        <Sidebar />
      </aside>

      {/* 모바일 드로어 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* 배경 클릭으로 닫기. 버튼으로 두면 스크린리더가 읽으므로 aria-hidden. */}
          <button
            aria-label="메뉴 닫기"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-sidebar-border shadow-xl">
            <div className="absolute top-3 right-2 z-10">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="메뉴 닫기"
                onClick={() => setDrawerOpen(false)}
              >
                <X />
              </Button>
            </div>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* min-w-0: 메인 안의 긴 코드블록·표가 셸을 가로로 밀어내지 않게 한다. */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
          {/* 모바일: 드로어 열기 */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="메뉴 열기"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden"
          >
            <Menu />
          </Button>

          {/* 데스크톱: 사이드바 접기/펼치기 */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            onClick={() => setCollapsed((v) => !v)}
            className="hidden md:inline-flex"
          >
            {collapsed ? <PanelLeft /> : <PanelLeftClose />}
          </Button>

          <div className="flex-1" />
        </header>

        {children}
      </main>
    </div>
  );
}
