import { AppShell } from "@/components/layout/app-shell";
import { ChatPanel } from "@/features/chat/chat-panel";

export default function Home() {
  return (
    <AppShell>
      <ChatPanel />
    </AppShell>
  );
}
