// 채팅 스토어 본체 — 초기 상태 + 도메인 슬라이스(대화/메시지/타이핑/보고)를 합쳐
// zustand create + persist 로 만든다. 외부는 useChatStore 로 구독한다.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MODEL } from '../../lib/models';
import type { ChatStore } from './types';
import { makeSeedChat, REPORT_DIGEST } from './helpers';
import { chatPersistOptions } from './persist';
import { createConversationsSlice } from './slices/conversations';
import { createMessagesSlice } from './slices/messages';
import { createTypingSlice } from './slices/typing';
import { createReportsSlice } from './slices/reports';

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get, store) => ({
      // 초기 상태 — 시드 대화방 + 주간 다이제스트 보고방, 나머지는 휘발성 기본값.
      conversations: [makeSeedChat(), REPORT_DIGEST],
      activeId: '',
      typingIds: [],
      typingStatus: {},
      typingStartedAt: {},
      streamingId: {},
      aborters: {},
      cancelers: {},
      inflightTurns: {},
      model: DEFAULT_MODEL,

      setModel: (model) => set({ model }),

      // 도메인 슬라이스 액션 합치기
      ...createConversationsSlice(set, get, store),
      ...createMessagesSlice(set, get, store),
      ...createTypingSlice(set, get, store),
      ...createReportsSlice(set, get, store),
    }),
    chatPersistOptions,
  ),
);
