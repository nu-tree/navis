import { create } from 'zustand';

export type Screen = 'chat' | 'memories' | 'projects' | 'settings';

// 사이드바 상단 탭 — 클로드 데스크톱처럼 "채팅 · 보고서 · 코드"를 분리한다.
// 채팅 탭은 일반 대화방, 보고서 탭은 navis 선제 보고방, 코드 탭은 내 맥에서 도는
// 로컬 에이전트(클로드 코드) 세션만 보여준다. 코드 탭은 데스크톱에서만 노출.
export type ChatTab = 'chat' | 'report' | 'code';

type UiStore = {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  // 채팅/보고서 탭 (사이드바 + 본문이 함께 따른다)
  chatTab: ChatTab;
  setChatTab: (tab: ChatTab) => void;
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
  chatTab: 'chat',
  setChatTab: (tab) => set({ chatTab: tab }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  localMode: false,
  setLocalMode: (on) => set({ localMode: on }),
}));
