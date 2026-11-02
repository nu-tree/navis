import { Hono } from "hono";
import type { AppEnv } from "../types";
import { push } from "@navis/domain";
import {
  pushPresenceInputSchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
  type PushPresenceResult,
} from "@navis/validation";

// 웹 푸시 구독. 인증은 app.ts 의 기본 잠금이 걸어뒀다. 보내기는 chat 라우트가 턴 끝에 한다.
export const pushRoute = new Hono<AppEnv>()
  // 공개 키. null 이면 화면이 "이 서버는 알림을 보내지 않는다"로 보여준다.
  .get("/config", (c) => c.json({ publicKey: push.publicKey() }))
  .post("/subscribe", async (c) => {
    const parsed = pushSubscriptionInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "잘못된 구독" }, 400);
    try {
      await push.subscribe(c.get("userId"), parsed.data);
      return c.json({ ok: true });
    } catch (err) {
      console.error(`[push] 구독 저장 실패: ${err instanceof Error ? err.message : String(err)}`);
      return c.json({ error: "알림 설정을 저장하지 못했다." }, 500);
    }
  })
  .post("/unsubscribe", async (c) => {
    const parsed = pushUnsubscribeInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "잘못된 요청" }, 400);
    try {
      await push.unsubscribe(c.get("userId"), parsed.data.endpoint);
      return c.json({ ok: true });
    } catch (err) {
      console.error(`[push] 구독 해지 실패: ${err instanceof Error ? err.message : String(err)}`);
      return c.json({ error: "알림 설정을 저장하지 못했다." }, 500);
    }
  })
  // 지금 보고 있다는 신호. 보고 있는 동안은 푸시를 보내지 않고, 그사이 보내지 않은 방들을 돌려준다.
  .post("/presence", async (c) => {
    const parsed = pushPresenceInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "잘못된 요청" }, 400);
    const result: PushPresenceResult = {
      missed: push.heartbeat(c.get("userId"), parsed.data.deviceId, parsed.data.watching),
    };
    return c.json(result);
  });
