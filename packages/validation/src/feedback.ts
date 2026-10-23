import { z } from "zod";

// 피드백 — 회원이 나비스에게 말한 개선점을 관리자에게 보내는 것. 전하기(relay)의 반대 방향이다.
//
// 모델을 향한 설명문은 MCP 등록부(domain/feedback/mcp.ts)에 두고 여기엔 형태만 둔다.

/** 피드백 길이 상한 — 전하기 지시와 같다. */
export const FEEDBACK_TEXT_MAX = 1000;

// ── 회원 대화 턴 도구(feedback) ─────────────────────────────────────────
// 보내는 회원은 서버를 만들 때 정해진다. 도구 입력에는 내용만 있다.
export const feedbackToolInputSchema = z.object({
  text: z.string().trim().min(1).max(FEEDBACK_TEXT_MAX),
});

// ── 관리자 화면 ─────────────────────────────────────────────────────────
export const feedbackUpdateInputSchema = z.object({ done: z.boolean() });
export type FeedbackUpdateInput = z.infer<typeof feedbackUpdateInputSchema>;

// ── 와이어 ──────────────────────────────────────────────────────────────
export const feedbackItemSchema = z.object({
  id: z.string(),
  /** 보낸 회원의 표시(이메일 등). */
  from: z.string(),
  text: z.string(),
  done: z.boolean(),
  createdAt: z.string(), // ISO 8601
});
export type FeedbackItem = z.infer<typeof feedbackItemSchema>;
