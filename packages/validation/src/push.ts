import { z } from "zod";

// 웹 푸시 구독 — 브라우저의 PushSubscription.toJSON() 모양 그대로 받는다.
//
// ★ endpoint 는 브라우저 회사의 푸시 서비스 주소만 받는다. 서버가 이 주소로 요청을 보내므로,
//   아무 주소나 받으면 회원이 서버를 시켜 임의의 곳을 두드리게 할 수 있다.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // 크롬 · 안드로이드
  /^(.+\.)?push\.apple\.com$/, // 사파리 · 아이폰
  /^updates\.push\.services\.mozilla\.com$/, // 파이어폭스
  /^.+\.notify\.windows\.com$/, // 엣지
];
const isPushService = (raw: string) => {
  const { protocol, hostname } = new URL(raw);
  return protocol === "https:" && PUSH_HOSTS.some((h) => h.test(hostname));
};

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(2048).refine(isPushService, "알 수 없는 푸시 서비스"),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushUnsubscribeInputSchema = z.object({
  endpoint: z.string().min(1).max(2048),
});

/** 서버의 공개 키. null 이면 이 서버는 푸시를 보내지 않는다(VAPID 키 미설정). */
export const pushConfigSchema = z.object({ publicKey: z.string().nullable() });
export type PushConfig = z.infer<typeof pushConfigSchema>;

/** 서비스 워커가 받는 알림 내용. 같은 방의 알림은 tag(=방 id)로 갈아끼운다. */
export type PushPayload = {
  title: string;
  body: string;
  conversationId: string;
};
