import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { getJson } from './client';
import type { NamoryMcp } from '../lib/local-agent';

// 코드 세션이 namory 기억을 직접 MCP 로 붙일 수 있게, 서버에서 좌표(url/token)를 받아온다.
// 한 번 받으면 캐시 — 세션마다 다시 부르지 않게(좌표는 거의 안 바뀜).
let cached: NamoryMcp | null | undefined;

export async function fetchNamoryMcp(): Promise<NamoryMcp | null> {
  if (cached) return cached; // 성공만 캐시 — 실패는 다음 호출에서 재시도.
  if (!IS_BACKEND_CONFIGURED) return null;
  try {
    const data = await getJson<Partial<NamoryMcp>>('/api/agent/namory', 'namory 좌표 조회 오류');
    if (data.url && data.token) cached = { url: data.url, token: data.token };
    return cached ?? null;
  } catch {
    // 실패하면 기억 없이(순정) 코드 에이전트로 — 다음에 다시 시도.
    return null;
  }
}
