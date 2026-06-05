import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { getJson } from './client';
import type { Report } from '../store/chat-store';

// navis 선제 보고 폴링. 백엔드 미설정이면 빈 배열.
export async function fetchReports(): Promise<Report[]> {
  if (!IS_BACKEND_CONFIGURED) return [];
  const data = await getJson<{ reports: Report[] }>('/api/reports', 'navis 보고 조회 오류');
  return data.reports;
}
