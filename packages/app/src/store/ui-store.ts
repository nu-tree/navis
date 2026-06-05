import { create } from 'zustand';

export type Screen = 'chat' | 'memories' | 'projects';

type UiStore = {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  // 데스크톱 고정 사이드바 접기 (넓은 화면에서만 의미)
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  // 로컬 모드 — 켜면 채팅을 서버 navis 대신 데스크톱 로컬 에이전트(내 맥 파일/터미널)로 보냄.
  // 데스크톱 + 로컬 에이전트 가용 + 설정에서 enabled 일 때만 의미.
  localMode: boolean;
  setLocalMode: (on: boolean) => void;
};

// 라우터 없이 최상위 화면 전환 (채팅 ↔ 내 기억)
export const useUiStore = create<UiStore>((set) => ({
  screen: 'chat',
  setScreen: (screen) => set({ screen }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  localMode: false,
  setLocalMode: (on) => set({ localMode: on }),
}));
