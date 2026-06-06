import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeId } from '../lib/id';
import type { ChatMessage } from '../types';

export type ConversationKind = 'chat' | 'report';

export type Conversation = {
  id: string;
  title: string;
  kind: ConversationKind;
  messages: ChatMessage[];
  // 대화방마다 독립된 navis 세션 — 컨텍스트가 방끼리 섞이지 않는다.
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  // 카톡식 안 읽은 메시지 수 — 비활성 방에 navis 메시지/보고가 오면 +1, 방 열면 0.
  unread?: number;
  // 보고방 숨김 — 목록에서 가리되 데이터/크론은 유지(언제든 다시 보이게).
  hidden?: boolean;
};

// 서버 동기화로 내려오는 대화방 행(머지 입력). deletedAt 있으면 삭제 전파.
export type ConversationSyncRow = {
  id: string;
  title: string;
  kind: ConversationKind;
  messages: ChatMessage[];
  sessionId: string | null;
  unread: number;
  hidden: boolean;
  updatedAt: string;
  deletedAt: string | null;
};

// navis /api/reports 응답 항목
export type Report = {
  id: string;
  type: string;
  // 방 라우팅 키 (크론 id / "digest" / "calendar") + 방 제목(DB 기반)
  sourceId: string;
  sourceTitle: string;
  text: string;
  createdAt: string;
};

type ChatStore = {
  conversations: Conversation[]; // 최신이 앞
  activeId: string;
  typingIds: string[]; // 응답 생성 중인 대화방 id 목록 (방별 독립)
  newConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  // 스트리밍: 기존 메시지 텍스트에 델타를 이어붙임(점진 표시)
  appendMessageText: (conversationId: string, messageId: string, delta: string) => void;
  // 스트리밍 종료 시 권위 있는 최종 텍스트로 보정
  setMessageText: (conversationId: string, messageId: string, text: string) => void;
  setSessionId: (conversationId: string, sessionId?: string) => void;
  setTyping: (conversationId: string, typing: boolean) => void;
  // 메시지 이모지 리액션 토글 (있으면 제거, 없으면 추가)
  toggleReaction: (conversationId: string, messageId: string, emoji: string) => void;
  // 보고방을 보장(없으면 생성, 있으면 제목 갱신) — 크론 목록으로 미리 만들 때
  ensureReportRoom: (sourceId: string, title: string) => void;
  // navis 선제 보고를 출처(sourceId) 방에 추가(없으면 방 생성, 중복 id 무시)
  appendReport: (report: Report) => void;
  // 보고방 숨김/해제
  hideConversation: (id: string) => void;
  unhideConversation: (id: string) => void;
  // 같은 kind 안에서 보이는 방들의 새 순서(id 배열)로 재정렬 — 드래그앤드롭용
  reorderConversations: (kind: ConversationKind, orderedVisibleIds: string[]) => void;
  // 서버에서 받은 대화 스냅샷을 병합 — 방 단위 Last-Write-Wins(updatedAt) + 삭제 전파.
  mergeServerConversations: (rows: ConversationSyncRow[]) => void;
};

function now(): string {
  return new Date().toISOString();
}

function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

function emptyConversation(): Conversation {
  const ts = now();
  return {
    id: makeId('c'),
    title: '새 대화',
    kind: 'chat',
    messages: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

// 시드: 첫 실행 시 보여줄 빈 대화방(저장된 대화가 있으면 persist 가 덮어쓴다).
// id 는 생성 id(`c_…`)·과거 카운터 id(`c0`)와 겹치지 않는 예약값으로 둔다 — 'c0' 면
// 서버에 남은 실제 대화 'c0' 의 툼스톤에 시드 방이 휩쓸려 사라질 수 있다.
const SEED_CHAT: Conversation = {
  id: 'seed-chat',
  title: '나비스와의 대화',
  kind: 'chat',
  messages: [],
  createdAt: '2026-06-04T09:00:00.000Z',
  updatedAt: '2026-06-04T09:00:00.000Z',
};

// 보고방 id 규칙 — 출처(sourceId)별 방. 크론마다 방 1개(sourceId=크론 id).
const reportRoomId = (sourceId: string) => `report:${sourceId}`;

// 주간 다이제스트는 주기가 길어 비어 있어도 보이게 미리 시드. 크론·캘린더 방은
// 크론 목록(/api/crons)·첫 보고 도착 시 동적으로 생성된다.
const REPORT_DIGEST: Conversation = {
  id: reportRoomId('digest'),
  title: '📋 주간 다이제스트',
  kind: 'report',
  messages: [],
  createdAt: '2026-06-04T00:00:00.000Z',
  updatedAt: '2026-06-04T00:00:00.000Z',
};

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
  conversations: [SEED_CHAT, REPORT_DIGEST],
  activeId: SEED_CHAT.id,
  typingIds: [],

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

  addMessage: (conversationId, message) =>
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const namingFromFirst = c.messages.length === 0 && message.role === 'user';
        // navis(assistant) 가 안 보고 있는 방에 보낸 메시지만 안 읽음으로 카운트
        const incoming = message.role === 'assistant' && s.activeId !== conversationId;
        return {
          ...c,
          messages: [...c.messages, message],
          title: namingFromFirst ? titleFromText(message.text) : c.title,
          unread: incoming ? (c.unread ?? 0) + 1 : c.unread,
          updatedAt: now(),
        };
      }),
    })),

  appendMessageText: (conversationId, messageId, delta) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, text: m.text + delta } : m,
              ),
            }
          : c,
      ),
    })),

  setMessageText: (conversationId, messageId, text) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) => (m.id === messageId ? { ...m, text } : m)),
            }
          : c,
      ),
    })),

  setSessionId: (conversationId, sessionId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, sessionId } : c,
      ),
    })),

  setTyping: (conversationId, typing) =>
    set((s) => ({
      typingIds: typing
        ? Array.from(new Set([...s.typingIds, conversationId]))
        : s.typingIds.filter((x) => x !== conversationId),
    })),

  toggleReaction: (conversationId, messageId, emoji) =>
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== messageId) return m;
            const current = m.reactions ?? [];
            const reactions = current.includes(emoji)
              ? current.filter((e) => e !== emoji)
              : [...current, emoji];
            return { ...m, reactions };
          }),
        };
      }),
    })),

  ensureReportRoom: (sourceId, title) =>
    set((s) => {
      const id = reportRoomId(sourceId);
      const existing = s.conversations.find((c) => c.id === id);
      if (existing) {
        // 제목이 DB 에서 바뀌었으면 갱신
        if (existing.title === title) return s;
        return {
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        };
      }
      const ts = now();
      const room: Conversation = {
        id,
        title,
        kind: 'report',
        messages: [],
        createdAt: ts,
        updatedAt: ts,
      };
      return { conversations: [...s.conversations, room] };
    }),

  hideConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, hidden: true } : c,
      ),
    })),

  unhideConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, hidden: false } : c,
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

  appendReport: (report) =>
    set((s) => {
      const id = reportRoomId(report.sourceId);
      const existing = s.conversations.find((c) => c.id === id);
      if (existing?.messages.some((m) => m.id === report.id)) return s; // 중복

      const message: ChatMessage = {
        id: report.id,
        role: 'assistant',
        text: report.text,
        createdAt: report.createdAt,
      };

      const isActive = s.activeId === id;

      // 방이 없으면 보고와 함께 생성 (새 방은 비활성 → 안 읽음 1)
      if (!existing) {
        const room: Conversation = {
          id,
          title: report.sourceTitle,
          kind: 'report',
          messages: [message],
          createdAt: report.createdAt,
          updatedAt: report.createdAt,
          unread: isActive ? 0 : 1,
        };
        return { conversations: [...s.conversations, room] };
      }

      return {
        conversations: s.conversations.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: report.createdAt,
                unread: isActive ? 0 : (c.unread ?? 0) + 1,
              }
            : c,
        ),
      };
    }),
    }),
    {
      name: 'navis-chat',
      storage: createJSONStorage(() => AsyncStorage),
      // 응답 생성 중 표시(typingIds)는 휘발성이라 저장하지 않는다.
      partialize: (s) => ({ conversations: s.conversations, activeId: s.activeId }),
    },
  ),
);

// 파생 셀렉터 — 컴포넌트는 이걸로 활성 대화방만 구독
export const useActiveConversation = (): Conversation | undefined =>
  useChatStore((s) => s.conversations.find((c) => c.id === s.activeId));

export const useIsActiveTyping = (): boolean =>
  useChatStore((s) => s.typingIds.includes(s.activeId));

// 비활성 방들의 안 읽은 메시지 총합 — 헤더 메뉴(☰) 뱃지용
export const useTotalUnread = (): number =>
  useChatStore((s) => s.conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0));

// 보고방의 안 읽은 보고 총합 — "보고서" 탭 뱃지용
export const useTotalReportUnread = (): number =>
  useChatStore((s) =>
    s.conversations.reduce((sum, c) => (c.kind === 'report' ? sum + (c.unread ?? 0) : sum), 0),
  );
