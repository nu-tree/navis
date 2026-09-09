import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { NavisSidebar } from "./sidebar";

// ── 앱 셸 ────────────────────────────────────────────────────────────────────
// shadcn sidebar 가 접힘 상태(쿠키 영속) · Cmd+B 단축키 · 모바일 Sheet 드로어를
// 다 갖고 있으므로 여기는 조립과 레이아웃 보정만 한다.
//
// ★ 보정 두 곳 — 이게 없으면 스크롤이 깨진다.
//
// body 는 `h-dvh overflow-hidden` 이고, 스크롤은 메시지 목록 안에서만 일어나야 한다.
// 그런데 shadcn 의 기본값이 그 전제와 반대다:
//
//  ① SidebarProvider 래퍼는 `min-h-svh` 다 → "최소 뷰포트 높이"라서 내용이 크면
//     래퍼가 뷰포트를 넘어 자란다. body 가 overflow-hidden 이니 넘친 만큼 잘려서
//     안 보인다. `min-h-0 flex-1` 로 덮어써 높이를 body 에 맡긴다.
//  ② SidebarInset 은 `flex w-full flex-1 flex-col` 인데 min-h-0 이 없다 → flex
//     아이템의 기본 min-height 가 auto 라서 안쪽 overflow-y-auto 가 스크롤할 게
//     없어진다. min-h-0 을 줘야 아이템이 부모 크기로 잘리고 안쪽이 스크롤을 가져간다.
//     min-w-0 은 긴 코드블록·표가 셸을 가로로 밀어내지 않게 하는 몫이다.
//
// 서버 컴포넌트로 둔다 — 상태는 SidebarProvider(클라이언트)가 갖고, 셸 자체는
// 마크업만 하므로 클라이언트 번들에 들어갈 이유가 없다.

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
