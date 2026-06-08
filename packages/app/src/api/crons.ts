import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { apiUrl, authHeaders, getJson } from './client';

export type Cron = {
  id: string;
  title: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
};

// 크론 목록 — 크론마다 보고방을 미리 만들기 위해.
export async function fetchCrons(): Promise<Cron[]> {
  if (!IS_BACKEND_CONFIGURED) return [];
  const data = await getJson<{ crons: Cron[] }>('/api/crons', 'navis 크론 조회 오류');
  return data.crons;
}

// 크론 삭제 — "크론 보고방 나가기"에서 호출. navis가 namory에서 지우고 스케줄도 내린다.
export async function deleteCron(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/crons/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: authHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`navis 크론 삭제 오류: ${res.status}`);
}
