// 대화방 슬라이스 — 방 생성/선택/삭제/숨김/재정렬, 코드 세션·세션 id·폴더·브랜치,
// 서버 스냅샷 병합(LWW + 삭제 전파)을 담당한다.
import type { StateCreator } from 'zustand';
import { makeId } from '../../../lib/id';
import type { ChatStore, Conversation } from '../types';
import { emptyConversation, now } from '../helpers';

// 이 슬라이스가 제공하는 액션들. 상태(conversations/activeId)는 store 루트에서 초기화한다.
export type ConversationsSlice = Pick<
  ChatStore,
  | 'newConversation'
  | 'newCodeSession'
  | 'selectConversation'
  | 'deleteConversation'
  | 'setSessionId'
  | 'setCodeFolder'
  | 'setCodeBranch'
  | 'hideConversation'
  | 'unhideConversation'
  | 'reorderConversations'
  | 'mergeServerConversations'
>;

export const createConversationsSlice: StateCreator<ChatStore, [], [], ConversationsSlice> = (
  set,
  get,
) => ({
  newConversation: () => {
    // 이미 비어 있는 새 대화 방이 있으면 또 만들지 않고 그 방으로 — 빈 방 쌓임 방지.
    const existing = get().conversations.find(
      (c) => c.kind === 'chat' && !c.hidden && c.messages.length === 0,
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const conv = emptyConversation();
    set((s) => ({ conversations: [conv, ...s.conversations], activeId: conv.id }));
    return conv.id;
  },

  newCodeSession: () => {
    const existing = get().conversations.find(
      (c) => c.kind === 'code' && !c.hidden && c.messages.length === 0,
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const ts = now();
    const conv: Conversation = {
      id: makeId('code'),
      title: '새 코드 세션',
      kind: 'code',
      messages: [],
      createdAt: ts,
      updatedAt: ts,
    };
    set((s) => ({ conversations: [conv, ...s.conversations], activeId: conv.id }));
    return conv.id;
  },

  selectConversation: (id) =>
    set((s) => ({
      activeId: id,
      // 방을 열면 읽음 처리
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    })),

  deleteConversation: (id) =>
    set((s) => {
      const remaining = s.conversations.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = emptyConversation();
        return { conversations: [fresh], activeId: fresh.id };
      }
      const activeId = s.activeId === id ? remaining[0].id : s.activeId;
      return { conversations: remaining, activeId };
    }),

  setSessionId: (conversationId, sessionId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, sessionId } : c,
      ),
    })),

  setCodeFolder: (conversationId, workdir, project) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              workdir,
              project,
              // 폴더가 바뀌면 브랜치 표시도 초기화(새 폴더에서 다시 조회).
              branch: undefined,
              // 폴더가 바뀌면 이전 SDK 세션 맥락을 끊는다(새 폴더로 깨끗이 시작).
              sessionId: undefined,
              // 아직 빈 코드 세션이면 제목을 폴더/프로젝트명으로.
              title:
                c.messages.length === 0 ? (project || workdir.split('/').filter(Boolean).pop() || c.title) : c.title,
              updatedAt: now(),
            }
          : c,
      ),
    })),

  setCodeBranch: (conversationId, branch) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, branch, updatedAt: now() } : c,
      ),
    })),

  hideConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, hidden: true, updatedAt: now() } : c,
      ),
    })),

  unhideConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, hidden: false, updatedAt: now() } : c,
      ),
    })),

  // 보이는(숨김 아닌) kind 슬롯을 새 순서로 채운다. 숨김·다른 kind 항목은 자리 유지.
  reorderConversations: (kind, orderedVisibleIds) =>
    set((s) => {
      const byId = new Map(s.conversations.map((c) => [c.id, c] as const));
      const next = orderedVisibleIds
        .map((id) => byId.get(id))
        .filter((c): c is Conversation => !!c && c.kind === kind && !c.hidden);
      if (next.length === 0) return s;
      let i = 0;
      return {
        conversations: s.conversations.map((c) =>
          c.kind === kind && !c.hidden ? next[i++] ?? c : c,
        ),
      };
    }),

  mergeServerConversations: (rows) =>
    set((s) => {
      let convs = [...s.conversations];
      for (const r of rows) {
        const idx = convs.findIndex((c) => c.id === r.id);
        if (r.deletedAt) {
          // 서버에서 삭제됨 → 로컬에서도 제거(전파)
          if (idx !== -1) convs.splice(idx, 1);
          continue;
        }
        const incoming: Conversation = {
          id: r.id,
          title: r.title,
          kind: r.kind,
          messages: r.messages ?? [],
          sessionId: r.sessionId ?? undefined,
          unread: r.unread,
          hidden: r.hidden,
          createdAt: idx !== -1 ? convs[idx].createdAt : r.updatedAt,
          updatedAt: r.updatedAt,
        };
        if (idx === -1) {
          // 로컬에 없던 방 → 추가(최신이 앞)
          convs.unshift(incoming);
        } else if (new Date(r.updatedAt) > new Date(convs[idx].updatedAt)) {
          // 서버가 더 최신 → 교체(LWW). 로컬이 더 최신이면 유지(다음 push 에서 올라감).
          convs[idx] = incoming;
        }
      }
      // 활성 방이 사라졌으면 첫 방으로
      const activeId = convs.some((c) => c.id === s.activeId)
        ? s.activeId
        : convs[0]?.id ?? s.activeId;
      return { conversations: convs, activeId };
    }),
});
