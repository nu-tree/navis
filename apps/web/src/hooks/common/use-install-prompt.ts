"use client";

import { useSyncExternalStore } from "react";

/** 크롬 · 엣지만 주는 설치 이벤트. 표준 타입에 없다. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// 이벤트는 첫 렌더보다 먼저 올 수 있다 — 모듈이 읽히는 즉시 받아 둔다.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // 브라우저 기본 안내를 막고, 사이드바 버튼으로 우리가 띄운다.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

/**
 * 앱 설치(PWA). 설치할 수 있을 때만 `install` 이 있다 — 이미 설치했거나, 앱 창 안이거나,
 * 이벤트를 주지 않는 브라우저(사파리 · 파이어폭스)면 null 이다.
 */
export const useInstallPrompt = () => {
  const available = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred !== null,
    () => false,
  );

  const install = async () => {
    if (!deferred) return;
    const event = deferred;
    // 한 이벤트로는 한 번만 띄울 수 있다.
    deferred = null;
    emit();
    await event.prompt();
  };

  return available ? install : null;
};
