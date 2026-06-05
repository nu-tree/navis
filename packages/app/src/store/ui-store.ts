import { create } from 'zustand';

export type Screen = 'chat' | 'memories';

type UiStore = {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  // 데스크톱 고정 사이드바 접기 (넓은 화면에서만 의미)
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
};

// 라우터 없이 최상위 화면 전환 (채팅 ↔ 내 기억)
export const useUiStore = create<UiStore>((set) => ({
  screen: 'chat',
  setScreen: (screen) => set({ screen }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
