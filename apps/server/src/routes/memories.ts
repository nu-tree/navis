import { Hono, type Context } from "hono";
import { memory } from "@navis/domain";
import { isEmbeddingError, isNotFound } from "@navis/domain/errors";
import { recentInputSchema, saveInputSchema } from "@navis/validation";

// 기억 라우트. 인증은 app.ts 의 기본 잠금이 이미 걸어뒀다.
//
// 오류는 **종류**로 판정해 status 를 정한다. 메시지 문자열로 분기하지 않는다 —
// 문구를 다듬으면 404 가 500 이 된다(FR-041, STRUCTURE.md 7항).

/** 쿼리스트링은 전부 문자열로 온다. 숫자 필드만 골라 되돌린다. */
const numericQuery = (raw: Record<string, string>) => {
  const out: Record<string, unknown> = { ...raw };
  for (const key of ["limit", "days"] as const) {
    if (raw[key] !== undefined) out[key] = Number(raw[key]);
  }
  return out;
};

export const memoriesRoute = new Hono()
  .get("/", async (c) => {
    const parsed = recentInputSchema.safeParse(numericQuery(c.req.query()));
    if (!parsed.success) {
      return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    }
    try {
      return c.json(await memory.recent(parsed.data));
    } catch (err) {
      return failure(c, err);
    }
  })
  .post("/", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = saveInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    }
    try {
      // 중복 판정을 하지 않으므로 판별 유니온이 아니라 Memory 를 바로 돌려준다(FR-011).
      return c.json(await memory.save(parsed.data), 201);
    } catch (err) {
      return failure(c, err);
    }
  });

function failure(c: Context, err: unknown) {
  if (isNotFound(err)) {
    return c.json({ error: err.message }, 404);
  }
  if (isEmbeddingError(err)) {
    // 조용히 실패하지 않는다 — 사용자가 알아야 한다(FR-042).
    console.error(`[memories] 임베딩 실패: ${err.message}`);
    return c.json({ error: err.message }, 502);
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[memories] 실패: ${message}`);
  return c.json({ error: message }, 500);
}
