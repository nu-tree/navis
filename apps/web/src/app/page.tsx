import { AppShell } from "@/components/layout/app-shell";
import { ChatInput } from "@/features/chat/chat-input";

export default function Home() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              여기에 채팅이 들어갑니다
            </p>
          </div>
          <ChatInput />
        </div>
      </div>
    </AppShell>
  );
}
