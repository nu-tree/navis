import { z } from "zod";
import { messageSchema } from "./conversation";

// 사용자가 고를 수 있는 모델. 서버의 화이트리스트 검증과 UI 의 선택기가 같은 목록을 봐야
// 한다 — 갈라지면 "UI 엔 있는데 서버가 거부하는" 모델이 생긴다.
export const SELECTABLE_MODELS = [
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
] as const;
export const modelSchema = z.enum(SELECTABLE_MODELS);
export type Model = z.infer<typeof modelSchema>;

// model 없이 온 요청에 서버가 쓰는 기본값. UI 선택기의 초기값도 여기를 본다.
export const DEFAULT_MODEL: Model = "claude-opus-5";

export const chatRequestSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string(),
  // 첨부 이미지 (data URL). 텍스트가 비어도 이미지만으로 보낼 수 있다.
  images: z.array(z.string()).max(8).optional(),
  model: modelSchema.optional(),
  // 이 턴을 식별해 중지에 쓴다.
  turnId: z.string().min(1),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const cancelRequestSchema = z.object({ turnId: z.string().min(1) });
export type CancelRequest = z.infer<typeof cancelRequestSchema>;

// ── SSE 이벤트 ───────────────────────────────────────────────────────
// 스트림이 나르는 유일한 계약. 판별 유니온으로 두면 클라이언트가 event 문자열을
// 손으로 분기하지 않고 타입으로 받는다.
export const chatEventSchema = z.discriminatedUnion("type", [
  // 답변 토큰 조각
  z.object({ type: z.literal("delta"), text: z.string() }),
  // 확장 사고 조각 (opt-in)
  z.object({ type: z.literal("thinking"), text: z.string() }),
  // 진행 중인 도구
  z.object({ type: z.literal("status"), tool: z.string() }),
  // 완료된 도구 한 줄
  z.object({ type: z.literal("tool"), label: z.string() }),
  // 정상 종료 + 권위 있는 최종 텍스트
  z.object({
    type: z.literal("done"),
    message: messageSchema,
    sessionId: z.string().nullable(),
    // 이 턴에 기억을 저장했는지 → UI 가 💡 표시
    saved: z.boolean(),
  }),
  // 사용자/타임아웃 중지
  z.object({ type: z.literal("aborted"), reason: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
