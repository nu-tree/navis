import { fetchMemories, patchMemory, deleteMemory } from "../memories/api.js";
import { json, readJsonBody, withAppAuth } from "./respond.js";

// 앱 기억 페이지 — 목록 조회 / 수정 / 삭제.

export function handleGetMemories(req: Request): Promise<Response> {
  return withAppAuth(req, "[memories] 조회 실패:", async () => {
    const url = new URL(req.url);
    // limit 은 양의 정수만 허용 — 음수/0/소수/NaN 은 모두 무시(undefined → 서버 기본값).
    // Number("...")||undefined 만 쓰면 limit=-5 같은 음수가 그대로 통과한다.
    const rawLimit = url.searchParams.get("limit");
    const n = rawLimit != null ? Number(rawLimit) : NaN;
    const limit = Number.isInteger(n) && n > 0 ? n : undefined;
    const project = url.searchParams.get("project") ?? undefined;
    return json(200, { memories: await fetchMemories(limit, project) });
  });
}

export function handlePatchMemory(req: Request, id: string): Promise<Response> {
  return withAppAuth(req, "[memories] 수정 실패:", async () => {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const result = await patchMemory(id, parsed.body);
    return json(result.ok ? 200 : result.status, { ok: result.ok });
  });
}

export function handleDeleteMemory(req: Request, id: string): Promise<Response> {
  return withAppAuth(req, "[memories] 삭제 실패:", async () => {
    const result = await deleteMemory(id);
    return json(result.ok ? 200 : result.status, { ok: result.ok });
  });
}
