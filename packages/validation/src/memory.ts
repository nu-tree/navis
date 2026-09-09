import { z } from "zod";

// 기억 분류. DB 컬럼은 text 지만 값의 집합은 여기가 단일 출처다 —
// drizzle 스키마에 두면 이 enum 이 필요한 클라이언트가 drizzle 을 끌어와야 한다.
export const CATEGORIES = [
  "decision",
  "learning",
  "idea",
  "feeling",
  "people",
  "todo",
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

// 프로젝트 스코프(선택). 저장 시 태그, 조회 시 "그 프로젝트 + 개인 기억"으로 좁힌다.
export const projectSchema = z
  .string()
  .min(1)
  .optional()
  .describe("프로젝트 스코프 (선택). 조회 시 해당 프로젝트+개인 기억만.");

// ── 도구 입력 ────────────────────────────────────────────────────────
// MCP 도구 입력과 HTTP 요청 본문이 같은 모양이라 한 곳에서 정의한다.
// 모델을 향한 설명문(description)은 MCP 등록부에 두고, 여기엔 형태만 둔다.

export const saveInputSchema = z.object({
  content: z.string().min(1),
  category: categorySchema.optional(),
  project: projectSchema,
  source: z.string().optional(),
  // 기본 true — 유사 기억이 있으면 저장하지 않고 후보만 반환한다.
  skipIfDuplicate: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  relatedIds: z.array(z.string()).optional(),
});
export type SaveInput = z.infer<typeof saveInputSchema>;

export const recallInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
  category: categorySchema.optional(),
  project: projectSchema,
  withRelated: z.boolean().optional(),
});
export type RecallInput = z.infer<typeof recallInputSchema>;

export const recentInputSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  category: categorySchema.optional(),
  project: projectSchema,
});
export type RecentInput = z.infer<typeof recentInputSchema>;

export const updateInputSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1).optional(),
  category: categorySchema.optional(),
  // 할 일 완료/미완료
  done: z.boolean().optional(),
  // 빈 문자열이면 개인 기억으로 되돌림
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
  relatedIds: z.array(z.string()).optional(),
});
export type UpdateInput = z.infer<typeof updateInputSchema>;

export const removeInputSchema = z.object({ id: z.string().min(1) });
export type RemoveInput = z.infer<typeof removeInputSchema>;

export const todosInputSchema = z.object({
  includeDone: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  project: projectSchema,
});
export type TodosInput = z.infer<typeof todosInputSchema>;

export const graphifyInputSchema = z.object({
  project: projectSchema,
  category: categorySchema.optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
export type GraphifyInput = z.infer<typeof graphifyInputSchema>;

// ── 출력 ─────────────────────────────────────────────────────────────

export const memorySchema = z.object({
  id: z.string(),
  content: z.string(),
  category: categorySchema.nullable(),
  project: z.string().nullable(),
  tags: z.array(z.string()),
  done: z.boolean().nullable(),
  createdAt: z.string(), // ISO 8601
});
export type Memory = z.infer<typeof memorySchema>;

// save 는 중복 방지 때문에 두 갈래로 갈린다 — UI 가 분기해야 하는 판별 유니온.
export const saveResultSchema = z.discriminatedUnion("skipped", [
  z.object({ skipped: z.literal(false), memory: memorySchema }),
  z.object({ skipped: z.literal(true), duplicates: z.array(memorySchema) }),
]);
export type SaveResult = z.infer<typeof saveResultSchema>;

export const recallHitSchema = z.object({
  memory: memorySchema,
  score: z.number(),
});
export type RecallHit = z.infer<typeof recallHitSchema>;
