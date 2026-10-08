"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import { useClaudeTokenStatus } from "@/hooks/apis/settings/use-claude-token-status";
import { useOnboardingSeen } from "@/hooks/common/use-onboarding-seen";
import { useOnboardingStore } from "@/store/onboarding-store";
import { tourSteps } from "./tour-steps";

/** 화면에 실제로 보이는 요소인가. 닫힌 사이드바(모바일 시트) 안의 버튼은 크기가 0 이다. */
const isVisible = (selector: string) => {
  const el = document.querySelector(selector);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** 모바일에서 닫혀 있는 사이드바 안의 버튼을 가리킬 때 덧붙이는 위치 안내. */
const MENU_HINT = "<br/><br/><i>화면 왼쪽 위 메뉴 버튼을 누르면 찾을 수 있어요.</i>";

/**
 * 보이지 않는 요소를 짚는 단계는 가운데 말풍선으로 바꾼다 — 단계를 건너뛰지 않고 설명은 남기되,
 * 그 버튼이 어디 있는지 한 줄 덧붙인다.
 */
const fitToScreen = (steps: DriveStep[]): DriveStep[] =>
  steps.map((s) =>
    typeof s.element === "string" && !isVisible(s.element)
      ? { popover: { ...s.popover, description: `${s.popover?.description ?? ""}${MENU_HINT}` } }
      : s,
  );

/**
 * 게임 튜토리얼처럼 실제 버튼을 하나씩 밝히며 설명한다(driver.js). 첫 방문이면 자동으로 시작하고,
 * 사이드바 "사용법"으로 다시 연다. 끝내거나 닫으면 본 것으로 기록한다.
 */
export const OnboardingTour = () => {
  const open = useOnboardingStore((s) => s.open);
  const setOpen = useOnboardingStore((s) => s.setOpen);
  const { seen, markSeen } = useOnboardingSeen();
  const { data: token, isPending } = useClaudeTokenStatus();
  const router = useRouter();

  // 첫 방문이면 연다. seen 은 브라우저 저장소(외부 상태)라 effect 에서 반응한다.
  useEffect(() => {
    if (!seen) setOpen(true);
  }, [seen, setOpen]);

  useEffect(() => {
    // 마지막 단계 문구가 토큰 상태에 달려 있다 — 상태를 안 뒤에 시작한다.
    if (!open || isPending) return;

    const registered = token?.registered ?? false;
    const steps = fitToScreen(tourSteps({ tokenRegistered: registered }));
    // 토큰이 없으면 마지막 버튼이 설정 화면으로 데려간다 — 닫기만 하면 다음에 뭘 할지 모른다.
    const last = steps.at(-1);
    if (!registered && last?.popover) {
      last.popover = {
        ...last.popover,
        doneBtnText: "설정으로 가기",
        onNextClick: () => {
          tour.destroy();
          router.push("/settings");
        },
      };
    }

    const tour = driver({
      steps,
      showProgress: true,
      progressText: "{{current}} / {{total}}",
      nextBtnText: "다음",
      prevBtnText: "이전",
      doneBtnText: "시작하기",
      popoverClass: "navis-tour",
      stagePadding: 6,
      stageRadius: 12,
      overlayOpacity: 0.65,
      // 짚은 버튼을 눌러 버리면 화면이 바뀌어 안내가 엉킨다 — 안내 중에는 막는다.
      disableActiveInteraction: true,
      onDestroyed: () => {
        markSeen();
        setOpen(false);
      },
    });
    // 레이아웃이 자리 잡은 뒤 시작한다(사이드바 · 입력창의 첫 렌더 직후).
    const timer = window.setTimeout(() => tour.drive(), 300);
    return () => {
      window.clearTimeout(timer);
      if (tour.isActive()) tour.destroy();
    };
    // markSeen 은 렌더마다 새 함수지만 하는 일이 같다 — 투어를 다시 만들 이유가 아니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPending, token?.registered]);

  return null;
};
