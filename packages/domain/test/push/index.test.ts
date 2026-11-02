// 웹 푸시 — 구독 저장 · 회원 분리 · 사라진 구독 정리. 푸시 서비스(web-push)는 mock, DB 는 실제.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db, pushSubscriptions } from "@navis/db";
import { TEST_USERS, USER_A, USER_B } from "../test-users";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a) } }));
vi.stubEnv("NAVIS_VAPID_PUBLIC_KEY", "test-public");
vi.stubEnv("NAVIS_VAPID_PRIVATE_KEY", "test-private");

const push = await import("../../src/push/index");

const sub = (n: number) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/navis-test-${n}`,
  keys: { p256dh: `p${n}`, auth: `a${n}` },
});
const payload = { title: "나비스", body: "답", conversationId: "room-1" };
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describe("excerpt", () => {
  it("마크다운을 걷어내고 120자로 자른다", () => {
    expect(push.excerpt("## 제목\n**굵게** `코드`")).toBe("제목 굵게 코드");
    expect(push.excerpt("가".repeat(200))).toHaveLength(121);
  });
});

describe("보고 있는 회원", () => {
  const T0 = 1_000_000;

  it("보고 있으면 보내지 않고, 그 방을 다음 신호에 돌려준다", async () => {
    sendNotification.mockReset();
    push.heartbeat("watch-1", "dev", true);
    await push.notify("watch-1", { ...payload, conversationId: "room-w" });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(push.heartbeat("watch-1", "dev", true)).toEqual(["room-w"]);
    expect(push.heartbeat("watch-1", "dev", true)).toEqual([]);
    push.heartbeat("watch-1", "dev", false);
  });

  it("다른 기기가 안 본다고 해도 보고 있는 기기가 있으면 보고 있다", () => {
    push.heartbeat("watch-2", "pc", true, T0);
    push.heartbeat("watch-2", "phone", false, T0);
    expect(push.isWatching("watch-2", T0)).toBe(true);
    push.heartbeat("watch-2", "pc", false, T0);
    expect(push.isWatching("watch-2", T0)).toBe(false);
  });

  it("신호가 WATCH_TTL_MS 동안 없으면 안 보는 것으로 친다", () => {
    push.heartbeat("watch-3", "pc", true, T0);
    expect(push.isWatching("watch-3", T0 + push.WATCH_TTL_MS - 1)).toBe(true);
    expect(push.isWatching("watch-3", T0 + push.WATCH_TTL_MS)).toBe(false);
  });
});

describeDb("push (실제 DB)", () => {
  const cleanup = () => db.delete(pushSubscriptions).where(inArray(pushSubscriptions.userId, [...TEST_USERS]));
  afterAll(cleanup);
  beforeEach(async () => {
    await cleanup();
    sendNotification.mockReset();
  });

  it("그 회원의 기기에만 보낸다", async () => {
    await push.subscribe(USER_A, sub(1));
    await push.subscribe(USER_A, sub(2));
    await push.subscribe(USER_B, sub(3));
    await push.notify(USER_A, payload);
    const endpoints = sendNotification.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint);
    expect(endpoints.sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
  });

  it("같은 기기에 다른 회원이 구독하면 주인이 바뀐다", async () => {
    await push.subscribe(USER_A, sub(1));
    await push.subscribe(USER_B, sub(1));
    await push.notify(USER_A, payload);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("남의 구독은 해지하지 못한다", async () => {
    await push.subscribe(USER_A, sub(1));
    await push.unsubscribe(USER_B, sub(1).endpoint);
    await push.notify(USER_A, payload);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("410(구독 만료)을 받으면 지운다", async () => {
    await push.subscribe(USER_A, sub(1));
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await push.notify(USER_A, payload);
    sendNotification.mockClear();
    await push.notify(USER_A, payload);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
