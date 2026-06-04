import { create } from 'zustand';
import { MOCK_MESSAGES } from '../data/mock-messages';
import type { ChatMessage } from '../types';

type ChatStore = {
  messages: ChatMessage[];
  typing: boolean;
  // 멀티턴 유지용 navis 세션 id. 컨텍스트 한도 초과 시 비워 새 세션을 시작한다.
  sessionId?: string;
  addMessage: (message: ChatMessage) => void;
  setTyping: (typing: boolean) => void;
  setSessionId: (sessionId: string) => void;
  clearSession: () => void;
  reset: () => void;
};

// 채팅 전역 상태 — 컴포넌트들이 props 없이 직접 구독
export const useChatStore = create<ChatStore>((set) => ({
  messages: MOCK_MESSAGES,
  typing: false,
  sessionId: undefined,
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setTyping: (typing) => set({ typing }),
  setSessionId: (sessionId) => set({ sessionId }),
  clearSession: () => set({ sessionId: undefined }),
  reset: () => set({ messages: [], typing: false, sessionId: undefined }),
}));
