import type { Config } from "driver.js";

/** 대화 화면 · 설정 화면 튜토리얼이 같이 쓰는 모양 — 두 화면이 한 튜토리얼처럼 보이게. */
export const TOUR_CONFIG = {
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
} satisfies Config;
