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

// fetch 를 감싸 10초 후 abort. AbortController+setTimeout 패턴이라 RN Hermes(iOS/Android)·웹 모두에서 동작.
// (AbortSignal.timeout 정적 메서드가 Hermes 미구현이라 이전 withTimeout 가 iOS에서 TypeError 로 즉시 실패했음.)
// 성공/실패/abort 무관하게 finally 에서 clearTimeout 으로 타이머 정리 → 지연 abort/누수 없음.
export async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 인증 헤더로 GET 해서 JSON 을 돌려주는 헬퍼(보고/기억/크론 조회 공용).
export async function getJson<T>(path: string, errorLabel: string): Promise<T> {
  const res = await fetchWithTimeout(apiUrl(path), { headers: authHeaders() });
  if (!res.ok) throw new Error(`${errorLabel}: ${res.status}`);
  return (await res.json()) as T;
}
