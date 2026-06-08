import { getJson } from './client';

// navis 가 보관 중인 데스크톱 설치파일 중 가장 높은 버전. null 이면 아직 업로드 없음.
// 앱이 이 값을 자기 버전과 비교해 업데이트를 트리거한다(인앱 배너).
export async function fetchLatestDesktopVersion(): Promise<string | null> {
  const data = await getJson<{ version: string | null }>(
    '/api/desktop/latest',
    'navis 데스크톱 최신버전 조회 오류',
  );
  return data.version;
}
