import { Platform } from 'react-native';

// 데스크톱(Electron)·웹에서만 동작하는 네이티브 알림. 네이티브 모바일(iOS/Android)은
// ntfy/푸시를 따로 쓰므로 여기선 no-op. Web Notification API 를 any 로 다뤄 DOM lib
// 의존 없이 컴파일된다(Electron 렌더러는 이 API 로 mac/win 네이티브 알림을 띄운다).

let asked = false;

function getNotif(): any {
  if (Platform.OS !== 'web') return undefined;
  return (globalThis as any).Notification;
}

// 앱 시작 시 1회 호출 — 알림 권한 요청(미정 상태일 때만).
export function ensureNotifyPermission(): void {
  const Notif = getNotif();
  if (!Notif || asked) return;
  asked = true;
  if (Notif.permission === 'default') {
    try {
      Notif.requestPermission?.().catch(() => {});
    } catch {
      /* 무시 */
    }
  }
}

// 네이티브 알림 표시. 권한이 없으면 조용히 무시. onClick 시 창을 포커스한다.
export function notify(title: string, body: string, onClick?: () => void): void {
  const Notif = getNotif();
  if (!Notif || Notif.permission !== 'granted') return;
  try {
    const n = new Notif(title, { body });
    if (onClick) {
      n.onclick = () => {
        try {
          (globalThis as any).focus?.();
        } catch {
          /* 무시 */
        }
        onClick();
      };
    }
  } catch {
    /* 무시 */
  }
}

// 창이 백그라운드(가려짐)인지 — 포그라운드에서 보고 있는 방엔 알림을 안 띄우기 위해.
export function isWindowHidden(): boolean {
  if (Platform.OS !== 'web') return false;
  return Boolean((globalThis as any).document?.hidden);
}
