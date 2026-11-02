// 웹 푸시 — 창을 닫아도 답 도착을 알린다. 회원의 기기마다 구독(push_subscriptions)이 있다.
//
// ★ VAPID 키가 없으면 조용히 꺼진다(enabled() = false). 푸시는 덤이다 — 키를 안 넣었다고
//   서버가 부팅하지 못하거나 턴이 실패하면 안 된다.
// ★ 보내기는 기다리지 않는다(호출부가 void 로 부른다). 실패는 로그만 남긴다 — 답은 이미 기록됐다.

import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { db, pushSubscriptions } from "@navis/db";
import type { PushPayload, PushSubscriptionInput } from "@navis/validation";

type Vapid = { publicKey: string; privateKey: string; subject: string };

const vapid = (): Vapid | null => {
  const publicKey = process.env.NAVIS_VAPID_PUBLIC_KEY;
  const privateKey = process.env.NAVIS_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  // subject 는 푸시 서비스가 문제 생기면 연락할 곳이다. 애플은 mailto: 나 https: 만 받고, localhost 는 거부한다.
  return { publicKey, privateKey, subject: process.env.NAVIS_VAPID_SUBJECT || "mailto:navis@example.com" };
};

/** 화면이 구독할 때 쓰는 공개 키. null = 푸시 꺼짐. */
export const publicKey = (): string | null => vapid()?.publicKey ?? null;

export async function subscribe(userId: string, sub: PushSubscriptionInput): Promise<void> {
  const row = { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  // 같은 기기(endpoint)에 다른 회원이 로그인하면 주인을 바꾼다 — 남의 답 알림이 오면 안 된다.
  await db
    .insert(pushSubscriptions)
    .values({ endpoint: sub.endpoint, ...row })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: row });
}

/** 자기 구독만 지운다. 없으면 아무 일도 없다. */
export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** 알림 본문 — 마크다운 기호를 걷어내고 앞부분만. 화면의 answer-notification 과 같은 규칙. */
export const excerpt = (text: string) => {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~|[\]()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 120 ? `${plain.slice(0, 120)}…` : plain;
};

// ── 보고 있는 회원 ────────────────────────────────────────────────────────────────
//
// 나비스 창을 보고 있는 회원에게는 푸시를 보내지 않는다 — 답이 눈앞에 있는데 알림이 뜨면 소음이다.
// 서비스 워커(public/sw.js)도 보고 있으면 알림을 거르지만, 사파리는 받은 푸시마다 알림을 띄워야 해서
// 거기서는 거를 수 없다. 그래서 서버가 아예 보내지 않는다.
//
// ★ 메모리에 둔다. Cloud Run 은 인스턴스 하나다(deploy/service.yaml maxScale 1). 인스턴스가 바뀌어
//   기록이 사라지면 "안 보고 있다"로 보고 보낸다 — 지금까지와 같은 동작이라 잃을 것이 없다.
// ★ 화면은 보고 있는 동안 HEARTBEAT 마다 신호를 보내고, 창을 떠나면 바로 "안 본다"를 보낸다.
//   그 신호가 유실돼도 WATCH_TTL_MS 가 지나면 안 보는 것으로 친다.

/** 마지막 "보고 있다" 신호가 이보다 오래되면 안 보는 것으로 친다. 화면의 신호 간격(20초)의 두 배 남짓. */
export const WATCH_TTL_MS = 45_000;

/** userId → (deviceId → 마지막 "보고 있다" 시각 ms). */
const watchers = new Map<string, Map<string, number>>();
/** userId → 보고 있어서 푸시를 보내지 않은 방들. 다음 신호의 응답으로 화면에 건넨다. */
const missed = new Map<string, Set<string>>();

/** 회원이 지금 어느 기기에서든 나비스를 보고 있나. */
export const isWatching = (userId: string, now = Date.now()): boolean =>
  [...(watchers.get(userId)?.values() ?? [])].some((at) => now - at < WATCH_TTL_MS);

/**
 * 화면의 신호를 기록하고, 그동안 보내지 않은 방들을 돌려준다(돌려준 것은 지운다).
 * 화면은 그 방들의 최근 메시지를 다시 받는다 — 푸시가 오면 하던 일(sw.js 의 new-message)을 대신한다.
 */
export function heartbeat(userId: string, deviceId: string, watching: boolean, now = Date.now()): string[] {
  const devices = watchers.get(userId) ?? new Map<string, number>();
  if (watching) devices.set(deviceId, now);
  else devices.delete(deviceId);
  for (const [id, at] of devices) if (now - at >= WATCH_TTL_MS) devices.delete(id);
  if (devices.size > 0) watchers.set(userId, devices);
  else watchers.delete(userId);

  const rooms = [...(missed.get(userId) ?? [])];
  missed.delete(userId);
  return rooms;
}

/** 회원의 모든 기기로 보낸다. 지금 보고 있으면 보내지 않는다. 사라진 구독(404 · 410)은 지운다. */
export async function notify(userId: string, payload: PushPayload): Promise<void> {
  if (isWatching(userId)) {
    missed.set(userId, (missed.get(userId) ?? new Set<string>()).add(payload.conversationId));
    return;
  }

  const keys = vapid();
  if (!keys) return;

  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails: keys,
          // 한 시간 안에 못 전하면 버린다 — 늦게 온 "답 도착"은 소음이다.
          TTL: 3600,
          urgency: "high",
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
          return;
        }
        console.error(`[push] 보내기 실패 status=${status ?? "?"}`);
      }
    }),
  );
}
