"use client";

import { AppFrame } from "./app-frame";
import { AppShell } from "./app-shell";
import { NavisTopBar } from "./top-bar";
import { ChatPanel } from "@/features/chat/chat-panel";
import { MemoryPanel } from "@/features/conversation/memory-panel";
import { OnboardingTour } from "@/features/onboarding/onboarding-tour";
import { useConversationWorkspace } from "@/hooks/pages/conversation/use-conversation-workspace";
import { usePushBridge } from "@/hooks/pages/conversation/use-push-bridge";

export const Workspace = () => {
  const { rooms, current, select, refresh } = useConversationWorkspace();
  // 알림을 누르면 그 방을 연다 — 약속은 만든 방으로 온다(2026-11-13).
  usePushBridge(select);

  return (
    // 데스크탑: 왼쪽 방 목록 · 가운데 채팅 · 오른쪽 기억 패널. 사이드바는 lg, 패널은 xl 아래에서 숨는다.
    <AppFrame aside={current ? <MemoryPanel key={current.id} conversationId={current.id} /> : null}>
      <AppShell header={<NavisTopBar rooms={rooms} current={current} onSelect={select} />}>
        {/* 방 id 가 오기 전엔 그리지 않는다(use-conversation-workspace 주석). */}
        {current ? (
          <ChatPanel
            key={current.id}
            conversationId={current.id}
            topic={current.topic}
            onTurnEnd={refresh}
            onOpen={select}
          />
        ) : null}
        <OnboardingTour />
      </AppShell>
    </AppFrame>
  );
};
