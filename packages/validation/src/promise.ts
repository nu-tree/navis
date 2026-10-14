import { z } from "zod";

// 약속 — 나비스가 나중의 자기에게 남기는 일(specs/003). 종류 구분이 없다: 무엇을 할지는
// instruction 과 실행 때의 모델 판단이 정한다(헌장 원칙 I).
//
// 모델을 향한 설명문은 MCP 등록부(domain/promise/mcp.ts)에 두고 여기엔 형태만 둔다.

/** 회원당 켜진 약속 상한(FR-006). */
export const PROMISE_ACTIVE_LIMIT = 20;
/** 반복 약속의 최소 간격(FR-005). */
export const PROMISE_MIN_INTERVAL_MS = 60 * 60 * 1000;

// ISO 8601 + 오프셋 필수. 오프셋이 없으면 어느 시간대인지 모호하다 — 모델이 KST 를 빠뜨리는 실수를 막는다.
const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export const promiseScheduleInputSchema = z.union([
  z.object({ at: z.string().regex(OFFSET_ISO, "시간대 오프셋이 있는 ISO 시각이어야 한다") }),
  z.object({ cron: z.string().min(1).max(100) }),
]);
export type PromiseScheduleInput = z.infer<typeof promiseScheduleInputSchema>;

// ── 대화 턴 도구(promise) ──────────────────────────────────────────────
export const promiseCreateInputSchema = z.object({
  instruction: z.string().min(1).max(1000),
  label: z.string().min(1).max(40),
  schedule: promiseScheduleInputSchema,
});
export type PromiseCreateInput = z.infer<typeof promiseCreateInputSchema>;

export const promiseListInputSchema = z.object({ includeEnded: z.boolean().optional() });

export const promiseUpdateInputSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1).max(1000).optional(),
  label: z.string().min(1).max(40).optional(),
  schedule: promiseScheduleInputSchema.optional(),
  enabled: z.boolean().optional(),
});
export type PromiseUpdateInput = z.infer<typeof promiseUpdateInputSchema>;

export const promiseIdInputSchema = z.object({ id: z.string().min(1) });

// ── 약속 턴 도구(promise_run) ──────────────────────────────────────────
export const notifyInputSchema = z.object({ text: z.string().min(1).max(4000) });
export const setMemoInputSchema = z.object({ memo: z.string().max(2000) });
export const finishInputSchema = z.object({ reason: z.string().min(1).max(200) });

// ── 화면 · HTTP ───────────────────────────────────────────────────────
export const PROMISE_RUN_STATUSES = ["running", "spoke", "silent", "failed"] as const;
export const promiseRunStatusSchema = z.enum(PROMISE_RUN_STATUSES);
export type PromiseRunStatus = z.infer<typeof promiseRunStatusSchema>;

export const promiseRunSummarySchema = z.object({
  startedAt: z.string(),
  status: promiseRunStatusSchema,
  error: z.string().nullable(),
});
export type PromiseRunSummary = z.infer<typeof promiseRunSummarySchema>;

export const promiseScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), at: z.string() }),
  // description: "매일 21:00" 처럼 사람이 읽는 말.
  z.object({ kind: z.literal("cron"), cron: z.string(), description: z.string() }),
]);
export type PromiseSchedule = z.infer<typeof promiseScheduleSchema>;

export const promiseSchema = z.object({
  id: z.string(),
  label: z.string(),
  instruction: z.string(),
  schedule: promiseScheduleSchema,
  enabled: z.boolean(),
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  consecutiveFailures: z.number(),
  recentRuns: z.array(promiseRunSummarySchema),
});
export type PromiseItem = z.infer<typeof promiseSchema>;

/** 화면에서는 켜고 끄기만 한다. 만들기 · 고치기는 대화로(FR-003). */
export const promisePatchSchema = z.object({ enabled: z.boolean() });
