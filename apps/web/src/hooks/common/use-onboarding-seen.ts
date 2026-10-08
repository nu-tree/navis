"use client";

import { useSyncExternalStore } from "react";

/** 내용을 크게 바꾸면 버전을 올린다 — 이미 본 사람에게도 한 번 더 보여준다. */
const KEY = "navis:onboarding:v1";

const listeners = new Set<() => void>();

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "seen";
  } catch {
    // 사생활 보호 모드 등에서 저장소가 막히면 "봤다"로 친다 — 매번 튀어나오는 것보다 낫다.
    return true;
  }
};

/**
 * 튜토리얼을 봤는지 — 이 브라우저에만 남긴다(기기를 바꾸면 한 번 더 보인다).
 * 서버 렌더에서는 "봤다"로 본다 — 하이드레이션 전에 창이 깜빡 떴다 사라지지 않게.
 */
export const useOnboardingSeen = () => {
  const seen = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => true,
  );

  const markSeen = () => {
    try {
      localStorage.setItem(KEY, "seen");
    } catch {
      // 저장소가 막혀 있으면 기록하지 못한다 — read() 가 이미 "봤다"로 본다.
    }
    listeners.forEach((l) => l());
  };

  return { seen, markSeen };
};
