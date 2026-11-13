"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, CircleHelp, Download, Ellipsis, Inbox, LogOut, Menu, MessageCircleMore, Pencil, Settings } from "lucide-react";
import type { ConversationSummary } from "@navis/validation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { RoomList } from "@/features/conversation/room-list";
import { TopicDialog } from "@/features/conversation/topic-dialog";
import { InstallGuideDialog } from "@/features/install/install-guide-dialog";
import { useUpdateConversationTopic } from "@/hooks/apis/conversation/use-update-conversation-topic";
import { useSignOut } from "@/hooks/apis/auth/use-sign-out";
import { useIsAdmin } from "@/hooks/apis/me/use-me";
import { useInstallPrompt, useStandalone } from "@/hooks/common/use-install-prompt";
import { supabaseEnv } from "@/lib/supabase";
import { useOnboardingStore } from "@/store/onboarding-store";

/**
 * 위쪽 바 — 대화가 하나뿐이라 사이드바 대신 이것만 둔다(2026-10-14 사용자 결정).
 *
 * 자주 가는 곳(기억 · 설정)은 바로 보이는 아이콘, 가끔 쓰는 것(앱 설치 · 로그아웃)은 ⋯ 안에.
 * 가계부 · 일정 같은 화면이 생기면 기억 옆에 아이콘으로 더하고, 많아지면 ⋯ 로 옮긴다.
 * data-tour 는 첫 방문 튜토리얼이 짚는 자리다(features/onboarding/tour-steps.ts).
 */
type Props = {
  rooms: readonly ConversationSummary[];
  current: ConversationSummary | null;
  onSelect: (id: string) => void;
};

export function NavisTopBar({ rooms, current, onSelect }: Readonly<Props>) {
  const { mutate: signOut } = useSignOut();
  const openOnboarding = useOnboardingStore((s) => s.setOpen);
  const configured = supabaseEnv() !== null;
  const install = useInstallPrompt();
  const standalone = useStandalone();
  const admin = useIsAdmin();
  // 설치 안내 창은 메뉴 밖에 둔다 — 메뉴 안에 두면 메뉴가 닫히면서 창도 함께 사라진다.
  const [guideOpen, setGuideOpen] = useState(false);
  // 모바일 방 서랍 · 주제 고치기 창.
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const updateTopic = useUpdateConversationTopic();
  const topic = current && !current.isMain ? current.topic : null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-sidebar-border px-3 md:h-16 md:px-6">
      {/* 모바일은 사이드바가 없다 — 방 목록을 서랍으로 연다. */}
      <Button variant="ghost" size="icon" aria-label="대화방 목록" data-tour="rooms" className="lg:hidden" onClick={() => setRoomsOpen(true)}>
        <Menu />
      </Button>
      {/* 데스크탑의 메인 방은 제목을 두지 않는다 — 사이드바에 '나비스'가 이미 있다(2026-11-13 사용자 요청). */}
      <span className={topic ? "min-w-0 truncate text-base font-semibold" : "text-base font-extrabold lg:hidden"}>
        {topic ? current?.title : "나비스"}
      </span>
      {topic ? (
        <button
          type="button"
          onClick={() => setTopicOpen(true)}
          aria-label="주제 고치기"
          className="ml-2 hidden min-h-8 max-w-[28rem] items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
        >
          <span className="shrink-0">주제</span>
          <span className="truncate text-foreground/80">{topic}</span>
          <Pencil className="size-3.5 shrink-0" />
        </button>
      ) : null}
      <div className="flex-1" />

      <Button asChild variant="ghost" size="sm" data-tour="memories">
        <Link href="/memories">
          <Brain />
          기억
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="사용법"
        data-tour="help"
        onClick={() => openOnboarding(true)}
      >
        <CircleHelp />
      </Button>
      <Button asChild variant="ghost" size="icon" aria-label="설정" data-tour="settings">
        <Link href="/settings">
          <Settings />
        </Link>
      </Button>

      {/* 설치한 앱 창 안이면 설치가 필요 없고, 로그인을 켜지 않은 로컬 개발이면 로그아웃이 없다 —
          관리자 메뉴까지 셋 다 없으면 메뉴 자체를 두지 않는다(누를 게 없는 버튼은 고장으로 보인다). */}
      {standalone && !configured && !admin ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="더 보기">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* 관리자만 — 회원의 나비스에게 전할 말을 맡긴다(specs/004). 회원에게는 있는지도 보이지 않는다(FR-002). */}
            {admin ? (
              <DropdownMenuItem asChild>
                <Link href="/relay">
                  <MessageCircleMore />
                  말 걸기
                </Link>
              </DropdownMenuItem>
            ) : null}
            {/* 관리자만 — 회원이 나비스에게 말한 개선점을 모아 본다. */}
            {admin ? (
              <DropdownMenuItem asChild>
                <Link href="/feedback">
                  <Inbox />
                  피드백
                </Link>
              </DropdownMenuItem>
            ) : null}
            {/* 크롬 · 엣지는 바로 설치 창을 띄우고, 못 띄우는 브라우저(사파리 · 파이어폭스 등)는 설치 방법을 보여준다. */}
            {standalone ? null : (
              <DropdownMenuItem
                onSelect={async () => {
                  if (!install || !(await install())) setGuideOpen(true);
                }}
              >
                <Download />
                앱으로 설치
              </DropdownMenuItem>
            )}
            {configured ? (
              <DropdownMenuItem onSelect={() => signOut()}>
                <LogOut />
                로그아웃
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <InstallGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
      <Sheet open={roomsOpen} onOpenChange={setRoomsOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-4 bg-sidebar px-3 py-5 text-sidebar-foreground">
          <SheetTitle className="px-1.5 text-[17px]">대화방</SheetTitle>
          <RoomList
            rooms={rooms}
            currentId={current?.id ?? null}
            onSelect={(id) => {
              onSelect(id);
              setRoomsOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
      {current && topic ? (
        <TopicDialog
          key={current.id}
          open={topicOpen}
          onOpenChange={setTopicOpen}
          initialTopic={topic}
          pending={updateTopic.isPending}
          onSubmit={(next) => updateTopic.mutate({ id: current.id, topic: next }, { onSuccess: () => setTopicOpen(false) })}
        />
      ) : null}
    </header>
  );
}
