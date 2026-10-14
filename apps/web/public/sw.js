// 나비스 서비스 워커 — 웹 푸시만 받는다.
//
// ★ fetch 핸들러를 두지 않는다. 화면 · API 를 캐시하지 않는다 — 로그인 뒤의 화면이 기기에 남으면
//   다른 회원의 화면이나 낡은 답이 보일 수 있다(app/manifest.ts 주석).
// ★ 이 파일은 빌드를 거치지 않는다(public/). 고치면 브라우저가 바뀐 바이트를 보고 새로 설치한다.

/** 지금 나비스 창을 보고 있나. 보고 있으면 알림은 소음이다. */
const watching = async () => {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return windows.some((w) => w.focused && w.visibilityState === "visible");
};

/**
 * 사파리(맥 · 아이폰)는 받은 푸시마다 알림을 띄워야 한다 — 몇 번 안 띄우면 구독을 끊는다.
 * 그래서 사파리에서는 보고 있어도 띄운다.
 */
const mustShow = () => {
  const ua = self.navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua);
};

self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  event.waitUntil(
    (async () => {
      if (!mustShow() && (await watching())) return;
      // 설치한 앱이면 작업 표시줄 · Dock 아이콘에 점을 찍는다. 창으로 돌아오면 화면이 지운다.
      if (self.navigator.setAppBadge) await self.navigator.setAppBadge().catch(() => undefined);
      await self.registration.showNotification(data.title || "나비스", {
        body: data.body || "답변이 도착했어요.",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        // 같은 방의 알림은 새 것으로 갈아끼운다.
        tag: data.conversationId || "navis",
        data: { conversationId: data.conversationId || null },
      });
    })(),
  );
});

// 알림을 누르면 그 방을 연다 — 열린 창이 있으면 거기서, 없으면 새 창으로.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conversationId = event.notification.data && event.notification.data.conversationId;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        if (conversationId) existing.postMessage({ type: "open-conversation", conversationId });
        return;
      }
      await self.clients.openWindow(conversationId ? `/?c=${encodeURIComponent(conversationId)}` : "/");
    })(),
  );
});
