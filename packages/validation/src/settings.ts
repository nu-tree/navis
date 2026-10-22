import { z } from "zod";

// Claude 구독 토큰 설정(US5). **어떤 응답에도 원문이 없다**(FR-037) — 상태만 오간다.
export const claudeTokenStatusSchema = z.object({
  registered: z.boolean(),
  /** 끝 4자리 — 어느 토큰인지 알아볼 만큼만. */
  last4: z.string().nullable(),
  updatedAt: z.string().nullable(), // ISO 8601
});
export type ClaudeTokenStatus = z.infer<typeof claudeTokenStatusSchema>;

// 빈 값 · 공백뿐인 값은 거부한다. 지우려면 DELETE 를 쓴다 — "빈 값 저장 = 삭제"로 두면
// 실수로 비운 칸이 토큰을 지운다.
export const claudeTokenInputSchema = z.object({
  token: z.string().trim().min(1).max(4096),
});
export type ClaudeTokenInput = z.infer<typeof claudeTokenInputSchema>;

// Claude 요금제 한도 — 나비스로 대화할 때 마지막으로 받은 값(usage_limits). 계산하지 않은 원래 값이다.
const planWindowSchema = z.object({
  /** 0~1 비율. 0.21 = 21%. */
  utilization: z.number(),
  resetsAt: z.string(), // ISO 8601
});
export const planUsageSchema = z.object({
  fiveHour: planWindowSchema.nullable(),
  sevenDay: planWindowSchema.nullable(),
  /** allowed | allowed_warning | rejected */
  status: z.string(),
  /** 이 값을 받은 시각 — 대화가 없으면 낡는다. */
  observedAt: z.string(), // ISO 8601
});
export type PlanUsage = z.infer<typeof planUsageSchema>;
/** 아직 한 번도 받지 못했으면 null. */
export type PlanUsageStatus = PlanUsage | null;
