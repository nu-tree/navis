import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { desktopUpdate, hasDesktopUpdate, type UpdateStatus } from '../lib/desktop-update';
import { fetchLatestDesktopVersion } from '../api/desktop';
import { IS_BACKEND_CONFIGURED } from '../lib/config';

// a 가 b 보다 높은 시맨틱 버전인지(X.Y.Z).
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

export type DesktopUpdate = {
  // 배너에 표시할 버전. mode 가 null 이면 배너 숨김.
  version: string | null;
  // 'restart' = 다운로드 완료, 재시작하면 설치 / 'download' = 자동설치 불가 → 직접 받기.
  mode: 'restart' | 'download' | null;
  // 배너 화살표 동작.
  install: () => void;
};

// 데스크톱에서만 동작. navis 의 최신 데스크톱 버전을 30초 폴링해(앱이 이미 도는 reports
// 폴링과 같은 박자), 자기 버전보다 높으면 메인 프로세스에 다운로드를 트리거한다. 다운로드가
// 끝나면(onStatus 'downloaded') 인앱 배너를 띄운다 — 주기 타이머가 아니라 "서버에 새 버전이
// 올라온 순간"을 신호로 잡는 트리거 방식이라 앱 재시작이 필요 없다.
export function useDesktopUpdate(): DesktopUpdate {
  const [readyVersion, setReadyVersion] = useState<string | null>(null);
  const [needsManual, setNeedsManual] = useState(false);

  // 메인 프로세스 업데이터 이벤트 구독.
  useEffect(() => {
    if (!desktopUpdate) return;
    return desktopUpdate.onStatus((status: UpdateStatus) => {
      if (status.state === 'downloaded') {
        setReadyVersion(status.version);
      } else if (status.state === 'error') {
        // 다운로드는 됐는데 자동설치만 실패(adhoc 등) → 배너는 띄우되 "직접 받기"로.
        setNeedsManual(true);
      }
    });
  }, []);

  // 서버 최신버전 폴링. 데스크톱 + 백엔드 설정됐을 때만.
  const { data: latest } = useQuery({
    queryKey: ['desktop-latest'],
    queryFn: fetchLatestDesktopVersion,
    enabled: hasDesktopUpdate && IS_BACKEND_CONFIGURED,
    refetchInterval: 30_000,
  });

  // 서버 최신 > 설치 버전이면 다운로드 트리거. 완료는 위 onStatus 가 받아 배너를 띄운다.
  useEffect(() => {
    if (!desktopUpdate || !latest) return;
    if (isNewer(latest, desktopUpdate.currentVersion)) {
      void desktopUpdate.check();
    }
  }, [latest]);

  const serverHasNewer =
    !!desktopUpdate && !!latest && isNewer(latest, desktopUpdate.currentVersion);
  const version = readyVersion ?? (serverHasNewer ? latest : null);

  let mode: DesktopUpdate['mode'] = null;
  if (version) mode = needsManual ? 'download' : readyVersion ? 'restart' : null;

  const install = () => {
    if (!desktopUpdate) return;
    if (mode === 'download') void desktopUpdate.openDownload();
    else void desktopUpdate.install();
  };

  return { version, mode, install };
}
