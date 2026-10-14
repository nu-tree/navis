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

/** 설치한 앱 창 안인가. 아이폰은 표준 대신 navigator.standalone 을 쓴다. */
const readStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** 설치한 앱 창 안이면 true — 설치 버튼을 숨긴다. 서버 렌더에서는 true 로 봐서 깜빡이지 않게 한다. */
export const useStandalone = () =>
  useSyncExternalStore(
    (l) => {
      const mq = window.matchMedia("(display-mode: standalone)");
      mq.addEventListener("change", l);
      return () => mq.removeEventListener("change", l);
    },
    readStandalone,
    () => true,
  );

/**
 * 브라우저의 설치 창(크롬 · 엣지). 띄울 수 있을 때만 함수가 있다 — 이미 설치했거나, 이벤트를
 * 주지 않는 브라우저(사파리 · 파이어폭스)면 null 이다. 그때는 설치 방법 안내를 보여준다.
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
