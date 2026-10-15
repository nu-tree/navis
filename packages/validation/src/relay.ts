import { z } from "zod";

// 전하기 — 관리자가 한 회원의 나비스에게 맡기는 지시 하나(specs/004).
//
// 모델을 향한 설명문은 MCP 등록부(domain/relay/mcp.ts)에 두고 여기엔 형태만 둔다.

/** 지시 길이 상한 — 약속 지시와 같다(FR-008). */
export const RELAY_INSTRUCTION_MAX = 1000;

const instruction = z.string().trim().min(1).max(RELAY_INSTRUCTION_MAX);

// ── 관리자 화면 ─────────────────────────────────────────────────────────
// 화면은 목록에서 고르므로 회원 uuid 를 받는다. 모델이 채우는 입력이 아니라 원칙 II 의
// "모델이 남의 id 를 지어낼 자리"가 아니다.
export const relayCreateInputSchema = z.object({
  recipientId: z.uuid(),
  instruction,
});
export type RelayCreateInput = z.infer<typeof relayCreateInputSchema>;

// ── 관리자 대화 턴 도구(relay) ──────────────────────────────────────────
// ★ 회원 uuid 를 받지 않는다(헌장 원칙 II). to 는 이메일 · 이름이고 domain 이 회원 목록 안에서만 맞춘다.
export const relayToolInputSchema = z.object({
  to: z.string().trim().min(1).max(200),
  instruction,
});

// ── 전하기 턴 도구(relay_run) ───────────────────────────────────────────
export const relayDeliverInputSchema = z.object({ text: z.string().min(1).max(4000) });

// ── 와이어 ──────────────────────────────────────────────────────────────
export const relayStatusSchema = z.enum(["pending", "running", "delivered", "failed"]);
export type RelayStatus = z.infer<typeof relayStatusSchema>;

// ★ messageId · 나비스가 지은 문장은 싣지 않는다 — 관리자에게 돌아가는 것은 상태뿐이다(FR-019).
export const relayItemSchema = z.object({
  id: z.string(),
  /** 받는 회원의 표시(이메일 등). */
  to: z.string(),
  instruction: z.string(),
  status: relayStatusSchema,
  error: z.string().nullable(),
  createdAt: z.string(), // ISO 8601
  finishedAt: z.string().nullable(),
});
export type RelayItem = z.infer<typeof relayItemSchema>;

// 관리자가 받는 사람을 고를 때 보는 회원 하나. label 은 이메일, 없으면(로컬) uuid 앞 8자.
export const memberSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type Member = z.infer<typeof memberSchema>;
