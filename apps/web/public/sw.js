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

/** 제목에 넣을 첫 마디의 최대 길이. 첫 문장이 더 길면 이 안의 마지막 띄어쓰기에서 끊고 본문으로 잇는다. */
const HEADLINE_MAX = 40;

/**
 * 알림 제목 · 본문.
 *
 * 사파리로 설치한 앱(Dock에 추가 · 홈 화면)은 알림 맨 위에 앱 이름 "나비스"를 붙인다. 제목까지 "나비스"면
 * 이름이 두 번 찍힌다 — 그래서 사파리에서는 답의 첫 마디를 제목으로, 나머지를 본문으로 쓴다.
 * 크롬 · 엣지로 설치한 앱은 알림이 "Google Chrome" 이름으로 와서, 제목 "나비스"가 없으면 누가 보냈는지
 * 알 수 없다 — 거기서는 그대로 둔다.
 */
const headline = (title, body) => {
  if (!mustShow()) return { title, body };
  const text = body.trim();
  const cut = text.search(/[.!?。]\s|\n/);
  const first = (cut === -1 ? text : text.slice(0, cut + 1)).trim();
  if (!first) return { title, body };
  if (first.length <= HEADLINE_MAX) return { title: first, body: text.slice(first.length).trim() };
  const space = text.lastIndexOf(" ", HEADLINE_MAX);
  const end = space > 0 ? space : HEADLINE_MAX;
  return { title: `${text.slice(0, end)}…`, body: `…${text.slice(end).trim()}` };
};

/**
 * 설치한 앱이면 작업 표시줄 · Dock 아이콘에 숫자를 찍는다 — 답이 온 방의 수(남아 있는 알림 수).
 * 같은 방의 알림은 tag 로 하나로 합쳐지므로 방마다 1 이다. 창으로 돌아오면 화면이 지운다.
 */
const updateBadge = async () => {
  if (!self.navigator.setAppBadge) return;
  const count = (await self.registration.getNotifications()).length;
  await (count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge()).catch(() => undefined);
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
      // 열린 창에 새 메시지가 있다고 알린다 — 나비스가 먼저 건 말을 새로고침 없이 보이게
      // (hooks/pages/chat/use-sync-latest-messages.ts). 알림을 띄우든 말든 보낸다.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: "new-message", conversationId: data.conversationId || null });
      if (!mustShow() && (await watching())) return;
      const { title, body } = headline(data.title || "나비스", data.body || "답변이 도착했어요.");
      await self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        // 같은 방의 알림은 새 것으로 갈아끼운다.
        tag: data.conversationId || "navis",
        data: { conversationId: data.conversationId || null },
      });
      await updateBadge();
    })(),
  );
});

// 알림을 누르면 그 방을 연다 — 열린 창이 있으면 거기서, 없으면 새 창으로.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(updateBadge());
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
