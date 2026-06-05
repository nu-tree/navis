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

// 비스트리밍 REST 호출 공용 타임아웃 — navis 백엔드 REST 클라와 동일하게 10초.
const REQUEST_TIMEOUT_MS = 10_000;

// RequestInit 에 AbortSignal.timeout 을 주입하는 헬퍼. 스트리밍 경로엔 쓰지 말 것.
export const withTimeout = (init: RequestInit = {}): RequestInit => ({
  ...init,
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});

// 인증 헤더로 GET 해서 JSON 을 돌려주는 헬퍼(보고/기억/크론 조회 공용).
export async function getJson<T>(path: string, errorLabel: string): Promise<T> {
  const res = await fetch(apiUrl(path), withTimeout({ headers: authHeaders() }));
  if (!res.ok) throw new Error(`${errorLabel}: ${res.status}`);
  return (await res.json()) as T;
}
