import { vars } from 'nativewind';

export type ThemeName = 'dark' | 'light';

// 디자인 토큰 값(RGB 채널 "R G B"). tailwind.config 의 rgb(var(--x)) 가 이 값을 읽는다.
// 다크는 순검정 대신 딥네이비(우주 느낌)로 살짝 띄웠다 — 너무 어둡지 않게.
const DARK = {
  '--background': '13 14 26', // #0d0e1a 딥 스페이스 네이비
  '--surface': '22 24 39', // #161827
  '--border': '42 44 60', // #2a2c3c
  '--input': '30 32 48', // #1e2030
  '--ring': '99 102 241',
  '--foreground': '250 250 250',
  '--muted': '30 32 48',
  '--muted-foreground': '155 156 178', // #9b9cb2
  '--card': '24 26 40', // #181a28
  '--card-foreground': '250 250 250',
  '--primary': '99 102 241', // indigo
  '--primary-foreground': '255 255 255',
  '--secondary': '38 42 59', // #262a3b
  '--secondary-foreground': '229 229 234',
  '--accent': '139 92 246',
  '--accent-foreground': '255 255 255',
  '--destructive': '239 68 68',
  '--destructive-foreground': '255 255 255',
};

const LIGHT = {
  '--background': '247 247 251', // #f7f7fb
  '--surface': '255 255 255',
  '--border': '226 226 234', // #e2e2ea
  '--input': '238 238 243', // #eeeef3
  '--ring': '99 102 241',
  '--foreground': '26 26 34', // #1a1a22
  '--muted': '238 238 243',
  '--muted-foreground': '107 107 123', // #6b6b7b
  '--card': '255 255 255',
  '--card-foreground': '26 26 34',
  '--primary': '99 102 241',
  '--primary-foreground': '255 255 255',
  '--secondary': '236 236 242', // #ececf2
  '--secondary-foreground': '42 42 51',
  '--accent': '139 92 246',
  '--accent-foreground': '255 255 255',
  '--destructive': '239 68 68',
  '--destructive-foreground': '255 255 255',
};

// NativeWind vars() — 루트 View 의 style 로 주면 그 하위 트리의 토큰이 교체된다(웹/네이티브 공용).
export const THEME_VARS: Record<ThemeName, ReturnType<typeof vars>> = {
  dark: vars(DARK),
  light: vars(LIGHT),
};
