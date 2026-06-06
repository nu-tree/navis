import { Platform } from 'react-native';

// Electron 데스크톱 셸에서 실행 중인지 / 어떤 OS 인지 — 웹 빌드(react-native-web)가
// 브라우저 탭인지 Electron 창인지 userAgent 로 구분한다. 네이티브 모바일은 전부 false.
function ua(): string {
  if (Platform.OS !== 'web') return '';
  const nav = (globalThis as any).navigator;
  return nav && typeof nav.userAgent === 'string' ? nav.userAgent : '';
}

export const isElectron = /Electron/i.test(ua());
export const isMacDesktop = isElectron && /Mac OS X|Macintosh/i.test(ua());

// 네이티브 타이틀바를 숨겼을 때(hiddenInset), macOS 트래픽 라이트가 콘텐츠 좌상단을
// 가리지 않도록 비워 둘 상단 여백. 동시에 이 띠가 창 이동용 드래그 영역이 된다.
// macOS Electron 에서만 적용(브라우저 탭·윈도우·모바일은 0 → 기존 레이아웃 유지).
export const TITLEBAR_INSET = isMacDesktop ? 30 : 0;
