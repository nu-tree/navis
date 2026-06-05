import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { conversations } from "../db/schema.js";

// 대화방 기기 간 동기화 저장소. 머지 정책은 클라이언트가 담당(방 단위 LWW + 툼스톤);
// 서버는 단순히 전체를 돌려주고(upsert/soft-delete) 멍청하게 보관만 한다.

export type ConversationRow = typeof conversations.$inferSelect;

export async function listConversations(): Promise<ConversationRow[]> {
  return db.select().from(conversations);
}

export async function upsertConversation(input: {
  id: string;
  title: string;
  kind: string;
  messages: unknown;
  sessionId?: string | null;
  unread?: number;
  hidden?: boolean;
  updatedAt: Date;
}): Promise<ConversationRow> {
  const set = {
    title: input.title,
    kind: input.kind,
    messages: input.messages,
    sessionId: input.sessionId ?? null,
    unread: input.unread ?? 0,
    hidden: input.hidden ?? false,
    updatedAt: input.updatedAt,
    deletedAt: null, // 다시 push 되면 삭제 취소(되살림)
  };
  const [row] = await db
    .insert(conversations)
    .values({ id: input.id, ...set })
    .onConflictDoUpdate({ target: conversations.id, set })
    .returning();
  return row;
}

export async function softDeleteConversation(id: string): Promise<{ id: string }> {
  const now = new Date();
  await db
    .update(conversations)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(conversations.id, id));
  return { id };
}
