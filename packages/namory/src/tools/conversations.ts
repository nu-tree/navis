import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { conversations } from "../db/schema.js";

// 대화방 기기 간 동기화 저장소. 방 단위 LWW(updatedAt) + 툼스톤.
// 과거엔 "멍청한 보관소"(무조건 덮어쓰기)였으나, navis 가 백그라운드 챗 완주 시 서버
// 스스로 응답을 써넣게 되며 '쓰는 주체'가 클라+서버 둘이 됐다. 그래서 upsert 도 LWW 로
// 굳혀(들어온 updatedAt 이 기존보다 최신일 때만 갱신) 오래된 쓰기가 최신 응답을 덮지
// 못하게 한다(예: 폰의 디바운스 push 가 부분 말풍선으로 서버의 완성 답을 덮는 레이스).
// 기기 간 다중 쓰기에서도 last-writer-by-time 으로 일관 — 클라 머지 정책과 동일 키.

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
}): Promise<ConversationRow | undefined> {
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
  // LWW: 충돌(같은 id) 시 들어온 updatedAt 이 기존 이상일 때만 갱신. 더 오래된 쓰기는
  // 무시(returning 빈 배열 → undefined). 신규 행은 충돌이 없으니 항상 INSERT.
  const [row] = await db
    .insert(conversations)
    .values({ id: input.id, ...set })
    .onConflictDoUpdate({
      target: conversations.id,
      set,
      where: sql`${conversations.updatedAt} <= ${input.updatedAt}`,
    })
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
