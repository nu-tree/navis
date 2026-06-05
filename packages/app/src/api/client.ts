import { NAVIS_URL, NAVIS_TOKEN } from '../lib/config';

// navis 백엔드 호출 공통 — 엔드포인트 URL 조립 + 인증 헤더.
export const apiUrl = (path: string): string => `${NAVIS_URL}${path}`;

export const authHeaders = (): Record<string, string> => ({
  authorization: `Bearer ${NAVIS_TOKEN}`,
});

export const jsonHeaders = (): Record<string, string> => ({
  'content-type': 'application/json',
  ...authHeaders(),
});

// 인증 헤더로 GET 해서 JSON 을 돌려주는 헬퍼(보고/기억/크론 조회 공용).
export async function getJson<T>(path: string, errorLabel: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: authHeaders() });
  if (!res.ok) throw new Error(`${errorLabel}: ${res.status}`);
  return (await res.json()) as T;
}
