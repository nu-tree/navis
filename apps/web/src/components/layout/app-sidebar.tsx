import Link from "next/link";
import { Brain, Settings } from "lucide-react";
import type { ConversationSummary } from "@navis/validation";
import { PineRow } from "@/components/decor/winter-scene";
import { RoomList } from "@/features/conversation/room-list";

type Props = {
  rooms: readonly ConversationSummary[];
  currentId: string | null;
  onSelect: (id: string) => void;
};

/**
 * 왼쪽 사이드바 — 데스크탑(lg 이상)에서만 보인다. 모바일은 위쪽 바의 방 버튼이 같은 목록을 서랍으로 연다.
 *
 * 가운데보다 한 단 어두운 띠(`bg-sidebar`)라 화면에 깊이가 생긴다(디자인 캔버스 시안, 2026-11-13).
 * 로고는 원래 앱 아이콘을 그대로 쓴다(포인트색으로 다시 그리지 않는다).
 */
export function AppSidebar({ rooms, currentId, onSelect }: Readonly<Props>) {
  const item =
    "flex min-h-11 items-center gap-3 rounded-[10px] px-3.5 text-[14.5px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground";

  return (
    <aside className="relative z-10 hidden w-66 shrink-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar px-3 py-4 text-sidebar-foreground lg:flex">
      <div className="flex h-8 items-center gap-2.5 px-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 앱 아이콘, 최적화할 것이 없다. */}
        <img src="/icons/icon-192.png" alt="" className="size-8 rounded-[9px]" />
        <span className="text-[17px] font-semibold tracking-[-0.01em]">나비스</span>
      </div>

      <RoomList rooms={rooms} currentId={currentId} onSelect={onSelect} />

      {/* 바닥의 침엽수 숲 — 메뉴 뒤에 옅게 깐다. */}
      <PineRow className="absolute inset-x-0 bottom-0 h-36 w-full opacity-35" />
      <div className="relative flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
        <Link href="/memories" className={item}>
          <Brain className="size-4.5" />
          기억
        </Link>
        <Link href="/settings" className={item}>
          <Settings className="size-4.5" />
          설정
        </Link>
      </div>
    </aside>
  );
}
