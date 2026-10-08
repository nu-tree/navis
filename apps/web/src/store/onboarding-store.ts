"use client";

import { create } from "zustand";

// 튜토리얼 창이 열려 있는지 — 화면 상태. 사이드바의 "사용법"과 첫 방문 자동 열기가 같은 값을 본다.
type OnboardingStore = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
