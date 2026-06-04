import { create } from 'zustand';
import { MOCK_MESSAGES } from '../data/mock-messages';
import type { ChatMessage } from '../types';

type ChatStore = {
  messages: ChatMessage[];
  typing: boolean;
  addMessage: (message: ChatMessage) => void;
  setTyping: (typing: boolean) => void;
  reset: () => void;
};

// 채팅 전역 상태 — 컴포넌트들이 props 없이 직접 구독
export const useChatStore = create<ChatStore>((set) => ({
  messages: MOCK_MESSAGES,
  typing: false,
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setTyping: (typing) => set({ typing }),
  reset: () => set({ messages: [], typing: false }),
}));
