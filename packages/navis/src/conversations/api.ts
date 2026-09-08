// 대화 동기화 — namory 함수 직접 호출.
// 앱이 기기 간 채팅을 맞춘다: 전체 pull / 방 upsert(LWW) / 툼스톤 삭제.
// 예전의 25초 타임아웃은 HTTP 왕복 때문이었고, 이제 필요 없다.
import {
  listConversations,
  upsertConversation,
  softDeleteConversation,
} from "namory";

export async function listConversationsRemote(): Promise<unknown[]> {
  return listConversations();
}

export async function upsertConversationRemote(id: string, body: unknown): Promise<void> {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title : "";
  if (!title) throw new Error("title 필요");
  await upsertConversation({
    id,
    title,
    kind: b.kind === "report" ? "report" : "chat",
    messages: Array.isArray(b.messages) ? b.messages : [],
    sessionId: typeof b.sessionId === "string" ? b.sessionId : null,
    unread: typeof b.unread === "number" ? b.unread : 0,
    hidden: typeof b.hidden === "boolean" ? b.hidden : false,
    updatedAt: typeof b.updatedAt === "string" ? new Date(b.updatedAt) : new Date(),
  });
}

export async function deleteConversationRemote(id: string): Promise<void> {
  await softDeleteConversation(id);
}
