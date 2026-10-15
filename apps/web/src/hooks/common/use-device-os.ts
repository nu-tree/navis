"use client";

import { useSyncExternalStore } from "react";

export type DeviceOs = "mac" | "windows" | "linux" | "mobile";

const detect = (): DeviceOs => {
  const ua = navigator.userAgent;
  // iPad 는 데스크톱 사파리처럼 Macintosh 로 온다 — 터치 지점으로 가린다.
  if (/iPhone|iPad|iPod|Android/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "mobile";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  return "linux";
};

const noop = () => () => {};

/** 지금 기기의 운영체제. 바뀌지 않으므로 구독할 것이 없다. 서버 렌더에서는 mac 으로 그린다. */
export const useDeviceOs = (): DeviceOs => useSyncExternalStore(noop, detect, () => "mac");
