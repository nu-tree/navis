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
  // 핸드프리 음성 대화모드(ChatGPT Voice 식) on/off. 켜지면 전용 풀스크린 오버레이가
  // 현재 활성 대화 위에 떠 말로 주고받는다. 휘발성 — persist 안 함.
  voiceMode: boolean;
  setVoiceMode: (on: boolean) => void;
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
  voiceMode: false,
  setVoiceMode: (on) => set({ voiceMode: on }),
}));
