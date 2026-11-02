"use client";

import { useEffect, useRef } from "react";
import type { PushPresenceResult } from "@navis/validation";
import { fetchPost } from "@/utils/fetch-client";

/** 보고 있는 동안 신호를 보내는 간격. 서버는 45초(WATCH_TTL_MS) 동안 신호가 없으면 안 보는 것으로 친다. */
const HEARTBEAT_MS = 20_000;

/** 창이 보이고 포커스가 있다 — 사람이 지금 이 화면을 보고 있다. */
const isWatching = () => document.visibilityState === "visible" && document.hasFocus();

/**
 * 대화 화면을 보고 있는 동안 서버에 알린다 — 그동안 서버는 푸시를 보내지 않는다(domain push.heartbeat).
 * 사파리는 받은 푸시마다 알림을 띄워야 해서 서비스 워커에서 거를 수 없기 때문이다.
 *
 * 푸시를 안 받으면 "새 메시지가 있다"는 서비스 워커의 신호도 오지 않는다. 그래서 서버가 그사이 보내지
 * 않은 방들을 응답으로 돌려주고, onMissed 가 그 방들을 다시 받는다.
 */
export const useWatchingPresence = (onMissed: (conversationIds: string[]) => void) => {
  const onMissedRef = useRef(onMissed);
  useEffect(() => {
    onMissedRef.current = onMissed;
  }, [onMissed]);

  useEffect(() => {
    // 화면이 열릴 때마다 새 값 — 기기(탭)를 구분할 뿐 저장하지 않는다.
    const deviceId = crypto.randomUUID();

    const send = async (watching: boolean) => {
      // keepalive: 창을 닫는 중에도 "안 본다"가 나가게.
      const res = await fetchPost<PushPresenceResult>(
        "/api/push/presence",
        { deviceId, watching },
        { keepalive: true },
      ).catch(() => null);
      if (res?.ok && res.data.missed.length > 0) onMissedRef.current(res.data.missed);
    };

    const onChange = () => void send(isWatching());
    const onLeave = () => void send(false);
    const timer = window.setInterval(() => {
      if (isWatching()) void send(true);
    }, HEARTBEAT_MS);

    window.addEventListener("focus", onChange);
    window.addEventListener("blur", onChange);
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("pagehide", onLeave);
    onChange();

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onChange);
      window.removeEventListener("blur", onChange);
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("pagehide", onLeave);
      onLeave();
    };
  }, []);
};
