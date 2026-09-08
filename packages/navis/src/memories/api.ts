// 기억 CRUD — namory 함수 직접 호출.
//
// 예전엔 navis 가 namory REST(/memories)를 HTTP 로 프록시했다(앱에 namory 토큰을
// 노출하지 않기 위한 경유). 통합 후에는 같은 배포 안이라 그냥 함수를 부른다.
// { ok, status } 반환 형태는 유지한다 — 호출부(http/memories.ts)가 그 status 를
// 그대로 앱 응답 코드로 흘려보내고 있어, 여기서 예외로 바꾸면 앱 계약이 깨진다.
import { listMemories, update, remove, CATEGORIES, type Category } from "namory";

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
  tags?: string[];
  done?: boolean;
};

export async function fetchMemories(limit?: number, project?: string): Promise<Memory[]> {
  const rows = await listMemories({ limit, project });
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    category: r.category ?? null,
    project: r.project ?? null,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    // 앱은 문자열 타임스탬프를 기대한다(예전 JSON 응답과 동일).
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}

// 도메인 에러 → HTTP status 매핑. 예전 namory REST 의 replyCrudError 규약을 그대로 옮겼다.
// "해당 id의 ... 없습니다" → 404, "수정할 필드가 없습니다" → 400, 그 외 → 500.
function statusFor(err: unknown): number {
  const msg = err instanceof Error ? err.message : "";
  if (msg.startsWith("해당 id의")) return 404;
  if (msg.startsWith("수정할 필드가 없습니다")) return 400;
  return 500;
}

export async function patchMemory(
  id: string,
  patch: MemoryPatch,
): Promise<{ ok: boolean; status: number }> {
  // category 는 화이트리스트 검증 후에만 넘긴다(임의 문자열이 DB 로 새지 않게).
  const category =
    patch.category && CATEGORIES.includes(patch.category as Category)
      ? (patch.category as Category)
      : undefined;
  try {
    await update({
      id,
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(category ? { category } : {}),
      ...(patch.project !== undefined ? { project: patch.project } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.done !== undefined ? { done: patch.done } : {}),
    });
    return { ok: true, status: 200 };
  } catch (err) {
    const status = statusFor(err);
    if (status === 500) console.error("[memories] 수정 실패:", err);
    return { ok: false, status };
  }
}

export async function deleteMemory(id: string): Promise<{ ok: boolean; status: number }> {
  try {
    await remove({ id });
    return { ok: true, status: 200 };
  } catch (err) {
    const status = statusFor(err);
    if (status === 500) console.error("[memories] 삭제 실패:", err);
    return { ok: false, status };
  }
}
