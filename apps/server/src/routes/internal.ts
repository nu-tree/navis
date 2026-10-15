import { Hono } from "hono";
import { stream } from "hono/streaming";
import { promise, relay } from "@navis/domain";
import type { AppEnv } from "../types";
import * as runner from "../promise-runner";

// 내부 라우트 — Cloud Scheduler 전용(specs/003 R1 · R10). 인증은 app.ts 의 기본 잠금이 전용 토큰으로 건다.

/** 한 tick 이 집는 최대 실행 수(전하기 + 약속). 남은 것은 다음 tick 이 가져간다. */
const CLAIM_LIMIT = 5;
/** 응답이 오래 걸릴 때 연결이 끊기지 않게 흘리는 빈 줄 간격. */
const HEARTBEAT_MS = 30_000;

export const internalRoute = new Hono<AppEnv>().post("/tick", async (c) => {
  // 할 일이 없으면 DB 조회로 끝난다. 모델을 부르지 않는다(SC-006).
  // 전하기를 먼저 집는다 — 관리자가 기다리고 있고 한 번짜리다(specs/004 contracts/http.md). 약속은 남은 몫만.
  const accepting = runner.isAccepting();
  const relays = accepting ? await relay.claimPending(CLAIM_LIMIT) : [];
  const runs = accepting ? await promise.claimDue(CLAIM_LIMIT - relays.length) : [];
  const claimed = relays.length + runs.length;
  if (!claimed) return c.json({ claimed: 0, results: [] });

  // ★ 실행이 끝날 때까지 응답을 붙든다(research R2). Cloud Run 은 응답을 보낸 뒤 CPU 를 거의 주지
  //   않는다 — 200 을 먼저 주고 뒤에서 돌리면 약속 턴이 멈춘다.
  // ★ 헤더는 바로 보내고 본문을 흘린다. web 의 fetch(undici)는 헤더 · 본문 조각을 5분 넘게 기다리지
  //   않는다. 대화에 양보하느라 길어져도 끊기지 않게 빈 줄을 흘리고, 마지막 줄에 결과 JSON 을 쓴다.
  c.header("content-type", "application/json; charset=utf-8");
  return stream(c, async (s) => {
    const heartbeat = setInterval(() => void s.write("\n"), HEARTBEAT_MS);
    try {
      const results = await Promise.all([...relays.map(runner.enqueueRelay), ...runs.map(runner.enqueue)]);
      await s.write(JSON.stringify({ claimed, results }));
    } finally {
      clearInterval(heartbeat);
    }
  });
});
