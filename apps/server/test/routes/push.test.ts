// 웹 푸시 구독 라우트. domain 은 mock — 여기서는 받는 모양과 회원 전달만 본다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "test-token";
vi.stubEnv("API_TOKEN", TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
vi.stubEnv("NAVIS_OWNER_ID", "00000000-0000-4000-8000-000000000001");

const MEMBER = "00000000-0000-4000-8000-0000000000a1";
const subscribe = vi.fn(async () => undefined);
const unsubscribe = vi.fn(async () => undefined);

vi.mock("@navis/domain", () => ({
  push: {
    publicKey: () => "test-public",
    subscribe: (...a: unknown[]) => subscribe(...(a as [])),
    unsubscribe: (...a: unknown[]) => unsubscribe(...(a as [])),
  },
}));

const { app } = await import("../../src/app");

const post = (path: string, body: unknown) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "x-navis-user": MEMBER, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "p", auth: "a" } });

describe("/push", () => {
  beforeEach(() => vi.clearAllMocks());

  it("config 는 공개 키를 준다", async () => {
    const res = await app.fetch(
      new Request("http://localhost/push/config", {
        headers: { authorization: `Bearer ${TOKEN}`, "x-navis-user": MEMBER },
      }),
    );
    expect(await res.json()).toEqual({ publicKey: "test-public" });
  });

  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://web.push.apple.com/QGx",
    "https://updates.push.services.mozilla.com/wpush/v2/x",
    "https://wns2-bl2p.notify.windows.com/w/?token=x",
  ])("브라우저 푸시 서비스는 받는다 — %s", async (endpoint) => {
    const res = await post("/push/subscribe", sub(endpoint));
    expect(res.status).toBe(200);
    expect(subscribe).toHaveBeenCalledWith(MEMBER, sub(endpoint));
  });

  // 서버가 이 주소로 요청을 보낸다 — 아무 주소나 받으면 회원이 서버를 시켜 임의의 곳을 두드린다.
  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://evil.example.com/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://169.254.169.254/latest",
  ])("그 밖의 주소는 400 — %s", async (endpoint) => {
    const res = await post("/push/subscribe", sub(endpoint));
    expect(res.status).toBe(400);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("해지는 이 회원의 것으로 넘긴다", async () => {
    await post("/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/abc" });
    expect(unsubscribe).toHaveBeenCalledWith(MEMBER, "https://fcm.googleapis.com/fcm/send/abc");
  });
});
