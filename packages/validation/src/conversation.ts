import { z } from "zod";

// 대화 메시지. conversations.messages jsonb 의 payload 이면서 동시에 와이어 계약이라
// DB·서버·클라이언트 셋이 같은 정의를 봐야 한다.
export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  createdAt: z.string(), // ISO 8601
  // 이 턴에 모델이 쓴 도구의 사람이 읽는 라벨. 표시용이라 문자열로 둔다.
  toolsUsed: z.array(z.string()).optional(),
  // 첨부 이미지 (data URL). 저장 시엔 비우고 원본은 남기지 않는다.
  images: z.array(z.string()).optional(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(messageSchema),
  // 이어갈 에이전트 세션 id. 방마다 맥락을 분리하므로 방 단위로 보관한다.
  sessionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

// 목록용 요약 — messages 전체를 내려보내지 않는다.
export const conversationSummarySchema = conversationSchema
  .omit({ messages: true })
  .extend({ lastMessage: z.string().nullable(), messageCount: z.number() });
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
