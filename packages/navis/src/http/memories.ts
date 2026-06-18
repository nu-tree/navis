import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchMemories, patchMemory, deleteMemory } from "../memories/api.js";
import { readJsonBody, sendJson, withAppAuth } from "./respond.js";

// 앱 기억 페이지 — namory 기억 REST 프록시. GET 목록 / PATCH 수정 / DELETE 삭제.
export async function handleMemories(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await withAppAuth(req, res, "[memories] proxy 실패:", async () => {
    const url = new URL(req.url ?? "/api/memories", "http://localhost");
    const idMatch = url.pathname.match(/^\/api\/memories\/([^/]+)$/);

    if (req.method === "GET" && url.pathname === "/api/memories") {
      // limit 은 양의 정수만 허용 — 음수/0/소수/NaN 은 모두 무시(undefined → 서버 기본값).
      // Number("...")||undefined 만 쓰면 limit=-5 같은 음수가 그대로 통과해 namory 가
      // 0 행을 반환하거나(우호적) 잘못된 페이지를 만들 수 있다.
      const rawLimit = url.searchParams.get("limit");
      const n = rawLimit != null ? Number(rawLimit) : NaN;
      const limit = Number.isInteger(n) && n > 0 ? n : undefined;
      const project = url.searchParams.get("project") ?? undefined;
      const memories = await fetchMemories(limit, project);
      sendJson(res, 200, { memories });
      return;
    }
    if (req.method === "PATCH" && idMatch) {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const result = await patchMemory(idMatch[1], body);
      sendJson(res, result.ok ? 200 : result.status, { ok: result.ok });
      return;
    }
    if (req.method === "DELETE" && idMatch) {
      const result = await deleteMemory(idMatch[1]);
      sendJson(res, result.ok ? 200 : result.status, { ok: result.ok });
      return;
    }
    sendJson(res, 404, { error: "not found" });
  });
}
