"use client";

import { create } from "zustand";

// 열린 대화방 — 화면 상태. null 이면 "나비스"(메인) 방이다.
// 기억 · 설정 화면에 다녀와도 같은 방이 열려 있게 컴포넌트 밖에 둔다.
type SelectedConversationStore = {
  selectedId: string | null;
  select: (id: string | null) => void;
};

export const useSelectedConversationStore = create<SelectedConversationStore>((set) => ({
  selectedId: null,
  select: (selectedId) => set({ selectedId }),
}));
