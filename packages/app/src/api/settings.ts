import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { apiUrl, jsonHeaders, getJson } from './client';

// 현재 유효한 시스템 프롬프트(DB→env→기본)를 받아온다.
export async function fetchSystemPrompt(): Promise<string> {
  if (!IS_BACKEND_CONFIGURED) return '';
  const data = await getJson<{ value: string }>(
    '/api/settings/system-prompt',
    '시스템 프롬프트 조회 오류',
  );
  return data.value ?? '';
}

// 시스템 프롬프트 저장(DB). 다음 턴부터 navis 에 적용.
export async function saveSystemPrompt(value: string): Promise<void> {
  if (!IS_BACKEND_CONFIGURED) return;
  const res = await fetch(apiUrl('/api/settings/system-prompt'), {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`시스템 프롬프트 저장 오류: ${res.status}`);
}
