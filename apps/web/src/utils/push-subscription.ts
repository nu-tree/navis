// 웹 푸시 구독 — 창을 닫아도 답 도착을 받는다(public/sw.js).
//
// 이 기기의 구독은 브라우저가 쥐고, 서버(push_subscriptions)에는 주소만 둔다. 알림 권한을
// 허락하면 자동으로 구독하고, 설정 화면에서 끌 수 있다.

import type { PushConfig } from "@navis/validation";
import { fetchGet, fetchPost } from "@/utils/fetch-client";

export type PushState =
  /** 이 브라우저가 웹 푸시를 못 한다(아이폰은 홈 화면에 추가한 앱에서만 된다). */
  | "unsupported"
  /** 서버에 VAPID 키가 없다. */
  | "disabled"
  /** 알림 권한을 거절했다 — 브라우저 설정에서만 되돌릴 수 있다. */
  | "denied"
  | "off"
  | "on";

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const registration = () => navigator.serviceWorker.register("/sw.js");

/** base64url 공개 키 → applicationServerKey. */
const toKey = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

/** 이 기기가 푸시를 받고 있나 — 받고 있으면 화면이 따로 알림을 띄우지 않는다(answer-notification). */
let active = false;
export const pushActive = () => active;

let publicKey: Promise<string | null> | null = null;
const getPublicKey = () =>
  (publicKey ??= fetchGet<PushConfig>("/api/push/config").then((r) => (r.ok ? r.data.publicKey : null)));

export const pushState = async (): Promise<PushState> => {
  if (!pushSupported()) return "unsupported";
  if (!(await getPublicKey())) return "disabled";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registration()).pushManager.getSubscription();
  active = !!sub && Notification.permission === "granted";
  return active ? "on" : "off";
};

/**
 * 구독하고 서버에 알린다. 이미 구독돼 있어도 서버에 다시 알린다 — 다른 회원이 이 기기를 쓰다
 * 넘어왔거나, 서버에서 만료로 지워졌을 수 있다. 권한은 이미 받았어야 한다.
 */
export const subscribePush = async (): Promise<boolean> => {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const key = await getPublicKey();
  if (!key) return false;
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
  const res = await fetchPost("/api/push/subscribe", sub.toJSON());
  active = res.ok;
  return res.ok;
};

/**
 * 화면을 열 때 부른다. 이미 구독한 기기만 서버에 다시 알린다 — 설정에서 끈 사람을 다시 켜지 않는다.
 */
export const syncPush = async (): Promise<void> => {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) await subscribePush();
};

export const unsubscribePush = async (): Promise<void> => {
  if (!pushSupported()) return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await fetchPost("/api/push/unsubscribe", { endpoint: sub.endpoint });
  await sub.unsubscribe();
  active = false;
};
