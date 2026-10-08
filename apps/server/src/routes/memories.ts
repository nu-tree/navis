import { Hono, type Context } from "hono";
import { memory } from "@navis/domain";
import { isEmbeddingError, isNotFound } from "@navis/domain/errors";
import {
  recallInputSchema,
  recentInputSchema,
  renameProjectInputSchema,
  saveInputSchema,
  todosInputSchema,
  updateInputSchema,
} from "@navis/validation";

// 기억 라우트. 인증은 app.ts 의 기본 잠금이 이미 걸어뒀다.
//
// 오류는 **종류**로 판정해 status 를 정한다. 메시지 문자열로 분기하지 않는다 —
// 문구를 다듬으면 404 가 500 이 된다(FR-041, STRUCTURE.md 7항).

/** 쿼리스트링은 전부 문자열로 온다. 숫자 필드만 골라 되돌린다. */
const numericQuery = (raw: Record<string, string>) => {
  const out: Record<string, unknown> = { ...raw };
  for (const key of ["limit", "days", "offset"] as const) {
    if (raw[key] !== undefined) out[key] = Number(raw[key]);
  }
  // 불리언은 "true" 만 참이다. "false" 를 Boolean() 하면 참이 된다.
  for (const key of ["includeDone", "exactProject", "personalOnly"] as const) {
    if (raw[key] !== undefined) out[key] = raw[key] === "true";
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
  // ★ 정적 경로를 /:id 류보다 먼저 등록한다. 나중에 GET /memories/:id 가 붙으면
  //   "search" 를 id 로 잡아먹는다.
  .get("/search", async (c) => {
    const parsed = recallInputSchema.safeParse(numericQuery(c.req.query()));
    if (!parsed.success) {
      return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    }
    try {
      return c.json(await memory.recall(parsed.data));
    } catch (err) {
      return failure(c, err);
    }
  })
  .get("/todos", async (c) => {
    const parsed = todosInputSchema.safeParse(numericQuery(c.req.query()));
    if (!parsed.success) {
      return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    }
    try {
      return c.json(await memory.todos(parsed.data));
    } catch (err) {
      return failure(c, err);
    }
  })
  // 0건이어도 200 + count: 0 (FR-051). 파일 이름은 받는 쪽(웹)이 정한다.
  .get("/export", async (c) => {
    try {
      return c.body(memory.serializeExport(await memory.exportAll()), 200, {
        "content-type": "application/json; charset=utf-8",
      });
    } catch (err) {
      return failure(c, err);
    }
  })
  .get("/projects", async (c) => {
    try {
      return c.json(await memory.projects());
    } catch (err) {
      return failure(c, err);
    }
  })
  // 이름 바꾸기 = 합치기. to 가 이미 있으면 merged: true 로 돌아온다. 없는 from 은 404.
  .post("/projects/rename", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = renameProjectInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    }
    if (parsed.data.from === parsed.data.to) {
      return c.json({ error: "바꿀 이름이 지금 이름과 같다." }, 400);
    }
    try {
      return c.json(await memory.renameProject(parsed.data));
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
  })
  // ── /:id 계열 — 정적 경로(/search · /todos · /export · /projects) 뒤에 둔다 ──────────
  .get("/:id/neighbors", async (c) => {
    const raw = c.req.query("limit");
    const limit = raw === undefined ? undefined : Number(raw);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 20)) {
      return c.json({ error: "limit 은 1~20 의 정수여야 한다." }, 400);
    }
    try {
      return c.json(await memory.neighbors(c.req.param("id"), limit));
    } catch (err) {
      return failure(c, err);
    }
  })
  .patch("/:id", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    // id 는 경로가 권위다 — 본문의 id 로 다른 기억을 고치지 못하게 덮어쓴다.
    const parsed = updateInputSchema.safeParse(
      typeof body === "object" && body !== null ? { ...body, id: c.req.param("id") } : body,
    );
    if (!parsed.success) {
      return c.json({ error: "잘못된 요청", detail: parsed.error.issues }, 400);
    }
    try {
      return c.json(await memory.update(parsed.data));
    } catch (err) {
      return failure(c, err);
    }
  })
  .delete("/:id", async (c) => {
    try {
      return c.json(await memory.remove(c.req.param("id")));
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
