"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, KeyRound, Plug, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { AiConnectSection } from "@/features/connect/ai-connect-section";
import { SettingsTour } from "@/features/onboarding/settings-tour";
import { ClaudeTokenForm } from "./claude-token-form";
import { NotificationSettings } from "./notification-settings";
import { PlanUsageCard } from "./plan-usage-card";

export const SETTINGS_TABS = ["claude", "connect", "notify"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "claude", label: "Claude", icon: KeyRound },
  { id: "connect", label: "AI 앱 연결", icon: Plug },
  { id: "notify", label: "알림", icon: Bell },
];

/**
 * 설정 화면 — 탭 셋: Claude(연결 · 사용량) · AI 앱 연결 · 알림. 화면 상한은 채팅 · 기억 · 설정 셋이다(SC-010).
 * 넓은 화면은 왼쪽 사이드바, 좁은 화면은 위쪽 탭. 고른 탭은 주소(?tab=)에 남겨 새로고침 · 링크로 돌아온다.
 * 튜토리얼은 탭 버튼(data-tour)을 짚는다 — 다른 탭의 칸은 그려져 있지 않다.
 */
export const SettingsScreen = ({ initialTab = "claude" }: { initialTab?: SettingsTab }) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  const select = (next: SettingsTab) => {
    setTab(next);
    // 다시 그리지 않고 주소만 바꾼다 — 탭 전환에 서버를 부를 일이 없다.
    window.history.replaceState(null, "", next === "claude" ? "/settings" : `/settings?tab=${next}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft />
            대화
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">설정</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 md:flex-row md:gap-8">
          <nav
            role="tablist"
            aria-label="설정"
            className="flex shrink-0 gap-1 overflow-x-auto md:sticky md:top-0 md:w-44 md:flex-col md:self-start"
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-tour={`settings-tab-${id}`}
                onClick={() => select(id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  tab === id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </nav>

          <div role="tabpanel" className="min-w-0 flex-1 space-y-4">
            {tab === "claude" && (
              <>
                <ClaudeTokenForm />
                <PlanUsageCard />
              </>
            )}
            {tab === "connect" && <AiConnectSection />}
            {tab === "notify" && <NotificationSettings />}
          </div>
        </div>
      </div>
      <SettingsTour />
    </div>
  );
};
