import { z } from "zod";
import { categorySchema } from "./memory";

// 대화 메시지 — 와이어 계약. DB 에는 messages 표 한 행으로 있고(specs/003 R7), toolsUsed · saved ·
// origin 은 그 행의 meta jsonb 에 산다. 매핑은 domain 의 몫이다.

// 사용자 말 없이 약속 실행에서 나온 메시지의 출처. 화면이 "⏰ 약속: {label}" 로 보인다.
export const messageOriginSchema = z.object({
  kind: z.enum(["promise", "promise-disabled"]),
  promiseId: z.string(),
  label: z.string(),
});
export type MessageOrigin = z.infer<typeof messageOriginSchema>;

// 한 턴에 쓴 토큰. 턴 안의 모든 모델 호출(도구를 쓰면 여러 번)을 더한 값이다.
// 화면은 input + cacheWrite + output 을 "이 질문으로 새로 쓴 양"으로 크게 보이고, cacheRead 는 내역에서
// 보인다. cacheWrite 를 새 입력에 넣는 이유: Agent SDK 는 입력 대부분을 캐시에 쓰며 보내서, input 만으로는
// 새로 읽은 양이 몇 토큰으로 줄어 보인다.
export const messageUsageSchema = z.object({
  // 캐시 없이 새로 읽은 입력
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  // 앞 턴과 같은 앞부분(시스템 프롬프트 · 도구 설명 · 이전 대화)을 캐시에서 다시 읽은 양
  cacheRead: z.number().int().nonnegative(),
  // 다음 턴을 위해 캐시에 새로 쓴 양
  cacheWrite: z.number().int().nonnegative(),
});
export type MessageUsage = z.infer<typeof messageUsageSchema>;

// 답하면서 기억 도구(recall · recent · todos)가 모델에게 넘긴 기억 하나. 그때의 사본이다 —
// 나중에 기억을 고치거나 지워도 "무엇을 보고 답했는지"는 그대로 남는다.
export const usedMemorySchema = z.object({
  id: z.string(),
  content: z.string(),
  category: categorySchema.nullable(),
  project: z.string().nullable(),
  createdAt: z.string(),
});
export type UsedMemory = z.infer<typeof usedMemorySchema>;

// items 는 상한까지만 담는다(기간 조회는 수백 건일 수 있다). total 이 실제로 넘긴 수다.
export const memoriesUsedSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(usedMemorySchema),
});
export type MemoriesUsed = z.infer<typeof memoriesUsedSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  createdAt: z.string(), // ISO 8601
  // 이 턴에 모델이 쓴 도구의 사람이 읽는 라벨. 표시용이라 문자열로 둔다.
  toolsUsed: z.array(z.string()).optional(),
  // 첨부 이미지 (data URL). 저장 시엔 비우고 원본은 남기지 않는다.
  images: z.array(z.string()).optional(),
  // 첨부 문서의 이름. 원본은 남기지 않고 이름만 남긴다 — 방을 다시 열어도 무엇을 붙였는지 보인다.
  files: z.array(z.object({ name: z.string() })).optional(),
  // 이 턴에 기억이 저장됐는지. 화면의 저장 표시 조건이 이것뿐이다(FR-010).
  // done 이벤트의 saved 를 그대로 옮겨 담아, 방을 다시 열어도 표시가 유지된다.
  saved: z.boolean().optional(),
  // 약속 메시지면 어느 약속에서 나왔는지. 없으면 평범한 대화 메시지다.
  origin: messageOriginSchema.optional(),
  // 나비스 답에만. 이 턴에 쓴 토큰 · 참고한 기억. 이 기능 전의 메시지에는 없다.
  usage: messageUsageSchema.optional(),
  memoriesUsed: memoriesUsedSchema.optional(),
});
export type Message =z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  // 최근 메시지만(오래된 → 최근 순). 이전 것은 hasMore 를 보고 페이지로 받는다(FR-026).
  messages: z.array(messageSchema),
  hasMore: z.boolean(),
  // 회원마다 하나인 "나비스" 방. 지울 수 없다(specs/003 R9).
  isMain: z.boolean(),
  // 이어갈 에이전트 세션 id. 방마다 맥락을 분리하므로 방 단위로 보관한다.
  sessionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

// 목록용 요약 — 메시지를 싣지 않는다. 마지막 메시지 본문 하나만.
export const conversationSummarySchema = conversationSchema
  .omit({ messages: true, hasMore: true })
  .extend({ lastMessage: z.string().nullable() });
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

// 이전 메시지 한 페이지. `before` 보다 앞선 것, 오래된 → 최근 순.
export const messagePageSchema = z.object({
  messages: z.array(messageSchema),
  hasMore: z.boolean(),
});
export type MessagePage = z.infer<typeof messagePageSchema>;

/** 한 번에 받는 메시지 수. 첫 화면 · 이전 페이지 모두. */
export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_PAGE_MAX = 100;
