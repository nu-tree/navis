"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Snowfall } from "@/components/decor/winter-scene";
import { useConversationWorkspace } from "@/hooks/pages/conversation/use-conversation-workspace";
import { AppSidebar } from "./app-sidebar";

type Props = {
  children: ReactNode;
  /** 오른쪽 칸(대화 화면의 기억 패널). 없으면 두 칸. */
  aside?: ReactNode;
};

/**
 * 모든 화면의 공통 틀 — 내리는 눈 · 왼쪽 사이드바(lg 이상) · 가운데 화면 · (있으면) 오른쪽 칸.
 * 대화 · 기억 · 설정 화면이 같은 모양이어야 다른 앱으로 넘어간 것처럼 보이지 않는다(2026-11-13).
 *
 * 다른 화면에서 사이드바의 방을 누르면 그 방을 고르고 대화 화면으로 간다.
 * 눈은 맨 뒤(z-0), 나머지는 그 위(relative z-10)에 둔다.
 */
export function AppFrame({ children, aside }: Readonly<Props>) {
  const pathname = usePathname();
  const router = useRouter();
  const { rooms, current, select } = useConversationWorkspace();
  const onChat = pathname === "/";

  return (
    <div className="relative flex min-h-0 flex-1">
      <Snowfall />
      <AppSidebar
        rooms={rooms}
        currentId={onChat ? (current?.id ?? null) : null}
        onSelect={(id) => {
          select(id);
          if (!onChat) router.push("/");
        }}
      />
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      {aside}
    </div>
  );
}
