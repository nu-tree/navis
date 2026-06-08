import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { apiUrl, authHeaders, jsonHeaders, getJson, fetchWithTimeout } from './client';

export type Memory = {
  id: string;
  content: string;
  category: string | null;
  project: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MemoryPatch = {
  content?: string;
  category?: string;
  project?: string;
};

// 내 기억 전체 조회 (navis → namory 프록시)
export async function fetchMemories(): Promise<Memory[]> {
  if (!IS_BACKEND_CONFIGURED) return [];
  const data = await getJson<{ memories: Memory[] }>('/api/memories', '기억 조회 오류');
  return data.memories;
}

export async function patchMemory(id: string, patch: MemoryPatch): Promise<void> {
  const res = await fetchWithTimeout(apiUrl(`/api/memories/${id}`), {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`기억 수정 오류: ${res.status}`);
}

export async function deleteMemory(id: string): Promise<void> {
  const res = await fetchWithTimeout(apiUrl(`/api/memories/${id}`), {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`기억 삭제 오류: ${res.status}`);
}
