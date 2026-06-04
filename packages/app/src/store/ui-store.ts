import { create } from 'zustand';

export type Screen = 'chat' | 'memories';

type UiStore = {
  screen: Screen;
  setScreen: (screen: Screen) => void;
};

// 라우터 없이 최상위 화면 전환 (채팅 ↔ 내 기억)
export const useUiStore = create<UiStore>((set) => ({
  screen: 'chat',
  setScreen: (screen) => set({ screen }),
}));
