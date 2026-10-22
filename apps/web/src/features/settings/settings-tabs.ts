// 설정 화면의 탭. 클라이언트 파일(settings-screen.tsx)에 두지 않는다 — 서버 컴포넌트(app/settings/page.tsx)가
// "use client" 파일의 값을 가져오면 배열이 아니라 참조 껍데기가 와서 .find 가 터진다(2026-10-22 운영 500).
export const SETTINGS_TABS = ["claude", "connect", "notify"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
