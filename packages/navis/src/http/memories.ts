import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchMemories, patchMemory, deleteMemory } from "../memories/api.js";
import { readBody, safeParse, requireAppAuth, sendJson } from "./respond.js";

// 앱 기억 페이지 — namory 기억 REST 프록시. GET 목록 / PATCH 수정 / DELETE 삭제.
export async function handleMemories(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;

  const url = new URL(req.url ?? "/api/memories", "http://localhost");
  const idMatch = url.pathname.match(/^\/api\/memories\/([^/]+)$/);

  try {
    if (req.method === "GET" && url.pathname === "/api/memories") {
      const limit = Number(url.searchParams.get("limit")) || undefined;
      const project = url.searchParams.get("project") ?? undefined;
      const memories = await fetchMemories(limit, project);
      sendJson(res, 200, { memories });
      return;
    }
    if (req.method === "PATCH" && idMatch) {
      const raw = await readBody(req, res);
      const body = (safeParse(raw) ?? {}) as Record<string, unknown>;
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
  } catch (err) {
    console.error("[memories] proxy 실패:", err);
    sendJson(res, 502, { error: "upstream error" });
  }
}
