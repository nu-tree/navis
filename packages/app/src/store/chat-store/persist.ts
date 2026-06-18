// persist 미들웨어 설정 — AsyncStorage 저장, 버전 마이그레이션(v1: 기본 모델 보정),
// partialize(휘발성 상태 제외), 복원 후 activeId 보정.
import { createJSONStorage } from 'zustand/middleware';
import type { PersistOptions } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_MODEL } from '../../lib/models';
import type { ChatStore } from './types';

export const chatPersistOptions: PersistOptions<ChatStore> = {
  name: 'navis-chat',
  storage: createJSONStorage(() => AsyncStorage),
  // v1: 일반 채팅 기본 모델을 Opus→Sonnet 으로 변경. 기존에 '기본값(Opus)'을 쓰던
  // 사용자만 새 기본값으로 옮기고, 일부러 다른 모델을 고른 경우는 존중한다(1회만 실행).
  version: 1,
  migrate: (persisted, version) => {
    const s = (persisted ?? {}) as { model?: string };
    if (version < 1 && s.model === 'claude-opus-4-8') s.model = DEFAULT_MODEL;
    return s as unknown as ChatStore;
  },
  // 응답 생성 중 표시(typingIds)는 휘발성이라 저장하지 않는다.
  partialize: (s) =>
    ({
      conversations: s.conversations,
      activeId: s.activeId,
      model: s.model,
    }) as ChatStore,
  // 복원 후 activeId 가 비어있거나 목록에 없으면 첫 번째 대화로 보정.
  onRehydrateStorage: () => (state) => {
    if (!state) return;
    const valid = state.conversations.some((c) => c.id === state.activeId);
    if (!valid) state.activeId = state.conversations[0]?.id ?? '';
  },
};
