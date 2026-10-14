"use client";

import { useEffect } from "react";
import { syncPush } from "@/utils/push-subscription";

/**
 * 푸시 알림과 화면을 잇는다(public/sw.js).
 * - 알림을 눌러 새 창으로 열렸으면(`/?c=방id`) 그 방을 연다.
 * - 열린 창에서 눌렀으면 서비스 워커가 보낸 메시지로 그 방을 연다.
 * - 창으로 돌아오면 앱 아이콘 배지를 지운다.
 * - 이미 구독한 기기면 서버에 다시 알린다(만료 · 회원 바뀜 대비).
 */
export const usePushBridge = (open: (conversationId: string) => void) => {
  useEffect(() => {
    void syncPush().catch(() => undefined);

    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("c");
    if (fromUrl) {
      open(fromUrl);
      // 새로고침해도 같은 방으로 튀지 않게 주소에서 뗀다.
      url.searchParams.delete("c");
      window.history.replaceState(null, "", url);
    }

    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; conversationId?: string } | null;
      if (data?.type === "open-conversation" && data.conversationId) open(data.conversationId);
    };
    const clearBadge = () => {
      if (!document.hidden) navigator.clearAppBadge?.().catch(() => undefined);
    };
    clearBadge();
    navigator.serviceWorker?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", clearBadge);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", clearBadge);
    };
    // open 은 setState 라 바뀌지 않는다 — 한 번만 건다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
