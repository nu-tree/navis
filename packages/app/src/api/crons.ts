import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { getJson } from './client';

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
