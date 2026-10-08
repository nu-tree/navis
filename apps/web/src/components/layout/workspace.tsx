"use client";

import { AppShell } from "./app-shell";
import { NavisSidebar } from "./sidebar";
import { ChatPanel } from "@/features/chat/chat-panel";
import { OnboardingTour } from "@/features/onboarding/onboarding-tour";
import { useConversationWorkspace } from "@/hooks/pages/conversation/use-conversation-workspace";

export const Workspace = () => {
  const { rooms, selectedId, select, createDraft, remove, refresh } = useConversationWorkspace();

  return (
    <AppShell
      sidebar={
        <NavisSidebar
          rooms={rooms}
          selectedId={selectedId}
          onSelect={select}
          onCreate={createDraft}
          onRemove={remove}
        />
      }
    >
      {/* key 로 방이 바뀔 때 패널 상태를 통째로 갈아끼운다 — 이전 방의
          스트리밍 버퍼나 오류가 새 방에 남지 않는다(FR-031). */}
      <ChatPanel key={selectedId} conversationId={selectedId} onTurnEnd={refresh} onOpen={select} />
      <OnboardingTour />
    </AppShell>
  );
};
