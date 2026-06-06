// 데스크톱(Electron) 자동 업데이트 브리지 래퍼. preload.cjs 가 window.navisUpdate 를
// 주입한 환경(데스크톱)에서만 존재한다. 모바일/웹(비-Electron)에선 undefined.

// 메인 프로세스(electron-main.cjs)가 보내는 업데이트 상태.
export type UpdateStatus =
  | { state: 'downloaded'; version: string }
  | { state: 'error'; downloadPage?: string };

type DesktopUpdateApi = {
  isDesktop: boolean;
  // 현재 설치된 앱 버전(예: '0.1.14').
  currentVersion: string;
  // 서버에 새 버전이 있을 때 다운로드를 트리거.
  check: () => Promise<unknown>;
  // 다운로드된 업데이트를 재시작하며 설치.
  install: () => Promise<{ ok: boolean }>;
  // 자동설치 불가(adhoc) 환경 → 다운로드 페이지를 브라우저로 연다.
  openDownload: () => Promise<{ ok: boolean }>;
  // 업데이트 상태 구독. 반환값은 해제 함수.
  onStatus: (cb: (status: UpdateStatus) => void) => () => void;
};

function getApi(): DesktopUpdateApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = (window as unknown as { navisUpdate?: DesktopUpdateApi }).navisUpdate;
  return api && api.isDesktop ? api : undefined;
}

export const desktopUpdate = getApi();
export const hasDesktopUpdate = !!desktopUpdate;
