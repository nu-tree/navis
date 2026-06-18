// 메시지 슬라이스 — 메시지 추가, 스트리밍 텍스트/도구/생각 델타 누적, 최종 보정,
// 이모지 리액션 토글을 담당한다.
import type { StateCreator } from 'zustand';
import type { ChatStore } from '../types';
import { now, titleFromText } from '../helpers';

export type MessagesSlice = Pick<
  ChatStore,
  | 'addMessage'
  | 'appendMessageText'
  | 'setMessageText'
  | 'setMessageToolsUsed'
  | 'appendMessageTool'
  | 'appendMessageThinking'
  | 'toggleReaction'
>;

export const createMessagesSlice: StateCreator<ChatStore, [], [], MessagesSlice> = (set) => ({
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

  setMessageToolsUsed: (conversationId, messageId, tools) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, toolsUsed: tools } : m,
              ),
            }
          : c,
      ),
    })),

  appendMessageTool: (conversationId, messageId, label) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== messageId) return m;
                const existing = m.toolsUsed ?? [];
                if (existing.includes(label)) return m;
                return { ...m, toolsUsed: [...existing, label] };
              }),
            }
          : c,
      ),
    })),

  appendMessageThinking: (conversationId, messageId, delta) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, thinking: (m.thinking ?? '') + delta } : m,
              ),
            }
          : c,
      ),
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
});
