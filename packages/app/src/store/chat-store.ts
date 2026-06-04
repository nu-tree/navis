import { create } from 'zustand';
import { MOCK_MESSAGES } from '../data/mock-messages';
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
  // 보고방 전용: 이 방으로 라우팅할 navis 보고 type 목록. undefined = catch-all.
  reportTypes?: string[];
  createdAt: string;
  updatedAt: string;
};

// navis /api/reports 응답 항목
export type Report = {
  id: string;
  type: string;
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
  setSessionId: (conversationId: string, sessionId?: string) => void;
  setTyping: (conversationId: string, typing: boolean) => void;
  // 메시지 이모지 리액션 토글 (있으면 제거, 없으면 추가)
  toggleReaction: (conversationId: string, messageId: string, emoji: string) => void;
  // navis 선제 보고를 type 에 맞는 보고방에 추가(중복 id 무시)
  appendReport: (report: Report) => void;
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

// 시드: 첫 대화방에 목업 인사 — 백엔드 연결돼도 첫 진입 화면이 비지 않게.
const SEED_CHAT: Conversation = {
  id: 'c0',
  title: '나비스와의 대화',
  kind: 'chat',
  messages: MOCK_MESSAGES,
  createdAt: '2026-06-04T09:00:00.000Z',
  updatedAt: '2026-06-04T09:01:03.000Z',
};

// 보고방(읽기 전용). 주간 다이제스트는 전용 방, 그 외 선제 보고는 알림 방(catch-all).
const REPORT_DIGEST: Conversation = {
  id: 'report-digest',
  title: '📋 주간 다이제스트',
  kind: 'report',
  reportTypes: ['digest'],
  messages: [],
  createdAt: '2026-06-04T00:00:00.000Z',
  updatedAt: '2026-06-04T00:00:00.000Z',
};

const REPORT_ALERTS: Conversation = {
  id: 'report-alerts',
  title: '🔔 알림 보고',
  kind: 'report',
  reportTypes: undefined, // catch-all (cron/calendar/기타)
  messages: [],
  createdAt: '2026-06-04T00:00:00.000Z',
  updatedAt: '2026-06-04T00:00:00.000Z',
};

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [SEED_CHAT, REPORT_DIGEST, REPORT_ALERTS],
  activeId: SEED_CHAT.id,
  typingIds: [],

  newConversation: () => {
    const conv = emptyConversation();
    set((s) => ({ conversations: [conv, ...s.conversations], activeId: conv.id }));
    return conv.id;
  },

  selectConversation: (id) => set({ activeId: id }),

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
        return {
          ...c,
          messages: [...c.messages, message],
          title: namingFromFirst ? titleFromText(message.text) : c.title,
          updatedAt: now(),
        };
      }),
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

  appendReport: (report) =>
    set((s) => {
      // type 매칭 보고방 → 없으면 catch-all 보고방
      const target =
        s.conversations.find(
          (c) => c.kind === 'report' && c.reportTypes?.includes(report.type),
        ) ?? s.conversations.find((c) => c.kind === 'report' && !c.reportTypes);
      if (!target || target.messages.some((m) => m.id === report.id)) return s;

      return {
        conversations: s.conversations.map((c) =>
          c.id === target.id
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: report.id,
                    role: 'assistant',
                    text: report.text,
                    createdAt: report.createdAt,
                  },
                ],
                updatedAt: report.createdAt,
              }
            : c,
        ),
      };
    }),
}));

// 파생 셀렉터 — 컴포넌트는 이걸로 활성 대화방만 구독
export const useActiveConversation = (): Conversation | undefined =>
  useChatStore((s) => s.conversations.find((c) => c.id === s.activeId));

export const useIsActiveTyping = (): boolean =>
  useChatStore((s) => s.typingIds.includes(s.activeId));
