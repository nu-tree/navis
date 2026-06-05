import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeName } from '../lib/theme';

type ThemeStore = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  toggle: () => void;
};

// 테마 선택(다크/라이트). 기본 다크. AsyncStorage 에 영속.
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'navis-theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
