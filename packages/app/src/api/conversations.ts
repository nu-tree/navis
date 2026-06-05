import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { apiUrl, authHeaders, jsonHeaders, getJson, withTimeout } from './client';
import type { Conversation, ConversationSyncRow } from '../store/chat-store';

// 전체 대화 스냅샷 받기(pull). 서버엔 chat 방만 올리므로 chat 위주로 내려온다.
export async function fetchConversations(): Promise<ConversationSyncRow[]> {
  if (!IS_BACKEND_CONFIGURED) return [];
  const data = await getJson<{ conversations: ConversationSyncRow[] }>(
    '/api/conversations',
    '대화 동기화 조회 오류',
  );
  return data.conversations;
}

// 방 1개 업서트(push). 변경된 방만 디바운스 후 호출.
export async function pushConversation(c: Conversation): Promise<void> {
  if (!IS_BACKEND_CONFIGURED) return;
  const res = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(c.id)}`), withTimeout({
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({
      title: c.title,
      kind: c.kind,
      messages: c.messages,
      sessionId: c.sessionId ?? null,
      unread: c.unread ?? 0,
      hidden: c.hidden ?? false,
      updatedAt: c.updatedAt,
    }),
  }));
  if (!res.ok) throw new Error(`대화 동기화 저장 오류: ${res.status}`);
}

// 방 삭제 전파(툼스톤).
export async function deleteConversationRemote(id: string): Promise<void> {
  if (!IS_BACKEND_CONFIGURED) return;
  const res = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(id)}`), withTimeout({
    method: 'DELETE',
    headers: authHeaders(),
  }));
  if (!res.ok) throw new Error(`대화 동기화 삭제 오류: ${res.status}`);
}
