"use client";

import { AppShell } from "@/components/layout/app-shell";
import { NavisSidebar } from "@/components/layout/sidebar";
import { ChatPanel } from "@/features/chat/chat-panel";
import { useConversations } from "@/features/conversation/use-conversations";

export default function Home() {
  const { rooms, selectedId, select, createDraft, remove, refresh } =
    useConversations();

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
      <ChatPanel key={selectedId} conversationId={selectedId} onTurnEnd={refresh} />
    </AppShell>
  );
}
