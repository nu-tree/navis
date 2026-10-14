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

/** 회원의 모든 기기로 보낸다. 사라진 구독(404 · 410)은 지운다. */
export async function notify(userId: string, payload: PushPayload): Promise<void> {
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
