import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { apiUrl, jsonHeaders, authHeaders, getJson } from './client';

// 동적 MCP 커넥터 — 목록/삭제 + OAuth 연결 시작 + 정적 키 직접 추가.
// 백엔드는 비밀값을 마스킹해 돌려준다(원문은 서버에만).

export interface ConnectorAuthView {
  type: 'none' | 'apikey' | 'oauth';
  header?: string;
  value?: string; // 마스킹된 값
  token?: string; // 마스킹된 값
  hasRefreshToken?: boolean;
  expiresAt?: number;
}

export interface ConnectorView {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  alwaysLoad: boolean;
  auth: ConnectorAuthView;
}

export interface ProviderView {
  key: string;
  label: string;
  available: boolean;
}

export async function fetchConnectors(): Promise<ConnectorView[]> {
  if (!IS_BACKEND_CONFIGURED) return [];
  const data = await getJson<{ connectors: ConnectorView[] }>(
    '/api/connectors',
    '커넥터 조회 오류',
  );
  return data.connectors ?? [];
}

export async function fetchProviders(): Promise<ProviderView[]> {
  if (!IS_BACKEND_CONFIGURED) return [];
  const data = await getJson<{ providers: ProviderView[] }>(
    '/api/connectors/providers',
    '제공자 조회 오류',
  );
  return data.providers ?? [];
}

// OAuth 연결 시작 — 동의 URL 을 받는다(앱이 브라우저로 연다).
export async function startOAuth(provider: string): Promise<string> {
  const res = await fetch(apiUrl('/api/connectors/oauth/start'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ provider }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { authUrl?: string; error?: string };
  if (!res.ok || !data.authUrl) throw new Error(data.error || `연결 시작 오류: ${res.status}`);
  return data.authUrl;
}

// 정적 키/공개 MCP 커넥터 직접 추가(또는 수정). auth 는 none / apikey.
export interface StaticConnectorInput {
  id: string;
  label?: string;
  url: string;
  auth: { type: 'none' } | { type: 'apikey'; header?: string; value: string };
  alwaysLoad?: boolean;
}

export async function saveConnector(input: StaticConnectorInput): Promise<void> {
  const { id, ...rest } = input;
  const res = await fetch(apiUrl(`/api/connectors/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(rest),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `커넥터 저장 오류: ${res.status}`);
  }
}

export async function deleteConnector(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/connectors/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: authHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`커넥터 삭제 오류: ${res.status}`);
}
