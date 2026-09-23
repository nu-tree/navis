// 대화방 — 목록 · 조회 · 생성 · 메시지 추가 · 삭제.
//
// 서버가 권위다. 예전의 기기 간 Last-Write-Wins 동기화(클라 updatedAt 비교,
// 시계 왜곡 방어, 툼스톤, 스냅샷 업로드)는 가져오지 않는다 — 클라이언트가
// 하나이므로 그 전부가 불필요하고, 거기 있던 버그도 함께 사라진다.

import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { conversations, db } from "@navis/db";
import type {
  Conversation,
  ConversationSummary,
  Message,
} from "@navis/validation";
import { NotFoundError } from "../errors";

/** 방 제목의 최대 길이. 첫 메시지에서 자를 때 쓴다(FR-034). */
const TITLE_MAX = 40;

type Row = typeof conversations.$inferSelect;

const toConversation = (row: Row): Conversation => ({
  id: row.id,
  title: row.title,
  messages: (row.messages ?? []) as Message[],
  sessionId: row.sessionId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * 첫 사용자 메시지에서 제목을 만든다(FR-034).
 *
 * 줄바꿈을 공백으로 눕혀 한 줄로 만든다 — 목록에서 두 줄짜리 제목은 레이아웃을 깨고,
 * 두 번째 줄은 어차피 잘린다.
 */
export const titleFrom = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "새 대화";
  return flat.length <= TITLE_MAX ? flat : `${flat.slice(0, TITLE_MAX)}…`;
};

/**
 * 방 목록. **`messages` 를 반환하지 않는다**(FR-032).
 *
 * 예전 `listConversations` 는 `SELECT *` 로 모든 방의 messages jsonb 를 다 실었다
 * (STRUCTURE.md 6항). 그게 30초 폴링과 겹쳐 하루 GB 단위 이그레스를 만들었다 —
 * 실측으로 확인된 사고다. 필요한 열만 읽는다.
 */
export async function list(): Promise<ConversationSummary[]> {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      sessionId: conversations.sessionId,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      messageCount: sql<number>`jsonb_array_length(${conversations.messages})`,
      // 마지막 메시지의 본문만. 배열 전체를 끌어오지 않는다.
      lastMessage: sql<string | null>`
        case when jsonb_array_length(${conversations.messages}) = 0 then null
        else ${conversations.messages} -> -1 ->> 'text' end`,
    })
    .from(conversations)
    // conversations_updated_at_idx 가 updated_at DESC 로 있다.
    .orderBy(desc(conversations.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sessionId: row.sessionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageCount: Number(row.messageCount),
    lastMessage: row.lastMessage,
  }));
}

export async function get(id: string): Promise<Conversation> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!row) throw new NotFoundError("conversation", id);
  return toConversation(row);
}

/** 있으면 그대로, 없으면 만든다. 첫 메시지를 보낼 때 불린다(R9). */
export async function ensure(
  id: string,
  titleSeed: string,
): Promise<Conversation> {
  const now = new Date();
  const [row] = await db
    .insert(conversations)
    .values({
      id,
      title: titleFrom(titleSeed),
      messages: [],
      updatedAt: now,
    })
    // 이미 있으면 아무것도 바꾸지 않는다 — 제목을 덮으면 두 번째 메시지에서
    // 방 이름이 바뀐다.
    .onConflictDoNothing()
    .returning();

  return row ? toConversation(row) : get(id);
}

/**
 * 메시지를 덧붙인다.
 *
 * `messages` 가 jsonb 통짜라 read-modify-write 가 된다. 클라이언트가 하나이고
 * 서버가 권위라 경합이 없다는 것이 이 설계의 전제다(schema.ts 주석).
 * jsonb 연산으로 DB 안에서 이어 붙여 왕복을 한 번으로 줄인다.
 */
export async function appendMessage(
  conversationId: string,
  message: Omit<Message, "id" | "createdAt"> & Partial<Pick<Message, "id" | "createdAt">>,
): Promise<Message> {
  const full: Message = {
    // `a${Date.now()}` 는 같은 ms 안에서 충돌한다(STRUCTURE.md 5항, FR-035).
    id: message.id ?? randomUUID(),
    createdAt: message.createdAt ?? new Date().toISOString(),
    ...message,
  } as Message;

  const [row] = await db
    .update(conversations)
    .set({
      messages: sql`${conversations.messages} || ${JSON.stringify([full])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId))
    .returning({ id: conversations.id });

  if (!row) throw new NotFoundError("conversation", conversationId);
  return full;
}

/** 이어갈 에이전트 세션 id 를 저장한다. result 메시지가 권위다(R10). */
export async function setSessionId(
  conversationId: string,
  sessionId: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({ sessionId })
    .where(eq(conversations.id, conversationId));
}

/** 방 삭제. 그 방에서 저장된 기억은 남는다 — 기억은 방과 독립이다(FR-015). */
export async function remove(id: string): Promise<void> {
  const [row] = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning({ id: conversations.id });

  if (!row) throw new NotFoundError("conversation", id);
}

/**
 * 메시지 하나 삭제.
 *
 * 중단된 질문이 남은 상태에서 다시 보내면 같은 질문이 두 번 보인다 — 그중 하나를
 * 지울 수 있어야 한다(엣지 케이스 "답 없는 질문의 연속").
 */
export async function removeMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  const conversation = await get(conversationId);
  const next = conversation.messages.filter((m) => m.id !== messageId);

  if (next.length === conversation.messages.length) {
    throw new NotFoundError("message", messageId);
  }

  await db
    .update(conversations)
    .set({ messages: next, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}
