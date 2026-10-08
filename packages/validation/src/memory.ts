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

// 프로젝트 필터의 범위. 기본(둘 다 없음)은 "그 프로젝트 + 개인 기억"(FR-018) — 대화에서 맥락을
// 좁힐 때의 규칙이다. 기억 화면처럼 정리하는 자리에서는 정확히 그 범위만 봐야 한다.
const projectScopeFields = {
  /** project 와 함께 쓰면 개인 기억을 섞지 않고 그 프로젝트만. */
  exactProject: z.boolean().optional(),
  /** 개인 기억(프로젝트 없음)만. project 와 함께 쓰지 않는다. */
  personalOnly: z.boolean().optional(),
};

// ── 도구 입력 ────────────────────────────────────────────────────────
// MCP 도구 입력과 HTTP 요청 본문이 같은 모양이라 한 곳에서 정의한다.
// 모델을 향한 설명문(description)은 MCP 등록부에 두고, 여기엔 형태만 둔다.

export const saveInputSchema = z.object({
  content: z.string().min(1),
  category: categorySchema.optional(),
  project: projectSchema,
  tags: z.array(z.string()).optional(),
  relatedIds: z.array(z.string()).optional(),
});
export type SaveInput = z.infer<typeof saveInputSchema>;

export const recallInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
  category: categorySchema.optional(),
  project: projectSchema,
  ...projectScopeFields,
  withRelated: z.boolean().optional(),
});
export type RecallInput = z.infer<typeof recallInputSchema>;

// 기간 경계. 날짜만 주면 한국 시간(KST) 하루로 읽는다 — since 는 그날 0시, until 은 그날 끝까지.
// 'today' · 'yesterday' 도 받는다. 대화 모델은 오늘 날짜를 모를 수 있다.
// 해석은 domain(memory/range.ts)의 몫이고, 여기선 형태만 막는다.
export const DATE_BOUND_PATTERN =
  /^(today|yesterday|\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)$/;
export const dateBoundSchema = z
  .string()
  .regex(DATE_BOUND_PATTERN)
  .optional()
  .describe("YYYY-MM-DD(KST 하루) · ISO 시각 · 'today' · 'yesterday'");

export const recentInputSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  since: dateBoundSchema,
  until: dateBoundSchema,
  // 기간 조회는 "그 기간 전건"이 목적이라 상한을 넉넉히 둔다.
  limit: z.number().int().min(1).max(500).optional(),
  category: categorySchema.optional(),
  project: projectSchema,
  ...projectScopeFields,
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

// 프로젝트 스코프 이름 바꾸기. to 가 이미 있으면 합치기(merge)가 된다 — 같은 연산이다.
export const renameProjectInputSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});
export type RenameProjectInput = z.infer<typeof renameProjectInputSchema>;

export const removeInputSchema = z.object({ id: z.string().min(1) });
export type RemoveInput = z.infer<typeof removeInputSchema>;

export const todosInputSchema = z.object({
  includeDone: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  project: projectSchema,
});
export type TodosInput = z.infer<typeof todosInputSchema>;

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

export const projectSummarySchema = z.object({
  project: z.string(),
  count: z.number().int(),
  lastAt: z.string(), // ISO 8601 — 가장 최근 기억
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

/**
 * 표기만 다른 프로젝트 이름을 같은 키로 접는다 — 대소문자 · 공백 · 하이픈 · 밑줄 · 점 등을 무시한다.
 * 'soopsns' · 'soop-sns' · 'Soop_SNS' 가 모두 같은 키다. 서버(저장 시 경고)와 웹(합칠 후보 표시)이
 * 같은 규칙을 써야 해서 여기 둔다.
 *
 * 편집 거리 같은 느슨한 비교는 하지 않는다 — 'navis' 와 'nevis' 를 같다고 하면 경고가 잡음이 된다.
 */
export const projectKey = (name: string): string =>
  name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export const renameProjectResultSchema = z.object({
  from: z.string(),
  to: z.string(),
  moved: z.number().int(),
  /** to 가 이미 있던 스코프였다 — 두 스코프가 하나로 합쳐졌다. */
  merged: z.boolean(),
});
export type RenameProjectResult = z.infer<typeof renameProjectResultSchema>;

// 중복 판정을 하지 않으므로(FR-011) 저장은 항상 성공하고 갈래가 하나다.
// 예전의 판별 유니온(skipped / duplicates)은 소비자를 잃어 접었다.
export const saveResultSchema = memorySchema;
export type SaveResult = z.infer<typeof saveResultSchema>;

export const recallHitSchema = z.object({
  memory: memorySchema,
  score: z.number(),
});
export type RecallHit = z.infer<typeof recallHitSchema>;

// 내보내기 (FR-050). 나비스 없이도 사람이 읽을 수 있어야 하므로 들여쓴 JSON 한 파일이다.
// 기억이 0건이어도 유효한 파일을 만든다(FR-051) — count: 0, memories: [].
export const memoryExportSchema = z.object({
  exportedAt: z.string(), // ISO 8601
  count: z.number().int().min(0),
  memories: z.array(memorySchema),
});
export type MemoryExport = z.infer<typeof memoryExportSchema>;
