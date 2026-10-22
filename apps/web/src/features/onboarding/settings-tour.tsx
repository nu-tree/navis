"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import { useClaudeTokenStatus } from "@/hooks/apis/settings/use-claude-token-status";
import { useOnboardingStore } from "@/store/onboarding-store";
import { TOUR_CONFIG } from "./tour-config";
import { settingsTourSteps } from "./tour-steps";

/**
 * 튜토리얼 2부 — 대화 화면 튜토리얼의 "설정 둘러보기"를 누르면 이 화면에서 이어서 짚는다.
 * 설정 화면에 직접 들어온 것만으로는 열리지 않는다(settingsOpen 은 1부의 마지막 버튼만 켠다).
 */
export const SettingsTour = () => {
  const open = useOnboardingStore((s) => s.settingsOpen);
  const setOpen = useOnboardingStore((s) => s.setSettingsOpen);
  const { data: token, isPending } = useClaudeTokenStatus();

  useEffect(() => {
    // 첫 칸의 문구가 토큰 상태에 달려 있다 — 상태를 안 뒤에 시작한다.
    if (!open || isPending) return;

    const tour = driver({
      ...TOUR_CONFIG,
      steps: settingsTourSteps({ tokenRegistered: token?.registered ?? false }),
      doneBtnText: "끝",
      onDestroyed: () => {
        setOpen(false);
        // 토큰이 아직이면 끝난 자리에서 바로 하게 맨 위 칸으로 돌려 둔다. 설정은 안쪽 칸이 스크롤된다(window 가 아니다).
        document.querySelector('[data-tour="settings-claude"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    });
    // 칸들이 그려진 뒤 시작한다(연결 목록 · 알림 상태의 첫 렌더 직후).
    const timer = window.setTimeout(() => tour.drive(), 400);
    return () => {
      window.clearTimeout(timer);
      if (tour.isActive()) tour.destroy();
    };
  }, [open, isPending, token?.registered, setOpen]);

  return null;
};
