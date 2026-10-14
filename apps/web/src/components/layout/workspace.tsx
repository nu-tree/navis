"use client";

import { AppShell } from "./app-shell";
import { NavisTopBar } from "./top-bar";
import { ChatPanel } from "@/features/chat/chat-panel";
import { OnboardingTour } from "@/features/onboarding/onboarding-tour";
import { useConversationWorkspace } from "@/hooks/pages/conversation/use-conversation-workspace";
import { usePushBridge } from "@/hooks/pages/conversation/use-push-bridge";

export const Workspace = () => {
  const { mainId, refresh } = useConversationWorkspace();
  // 방이 하나라 알림이 가리키는 방으로 옮길 일이 없다. 배지 지우기 · 구독 갱신만 한다.
  usePushBridge();

  return (
    <AppShell header={<NavisTopBar />}>
      {/* "나비스" 방 id 가 오기 전엔 그리지 않는다(use-conversation-workspace 주석). */}
      {mainId ? <ChatPanel key={mainId} conversationId={mainId} onTurnEnd={refresh} /> : null}
      <OnboardingTour />
    </AppShell>
  );
};
