import { config } from "../config.js";

// namory 기억 REST(/memories) 클라이언트. 앱은 navis(/api/memories)를 거쳐
// 이걸 호출한다 — namory 내부 URL/토큰을 앱에 노출하지 않기 위함.
const BASE = config.namoryMcpUrl.replace(/\/mcp\/?$/, "");
const auth = { Authorization: `Bearer ${config.namoryToken}` };

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
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (project) params.set("project", project);
  const qs = params.toString();
  const res = await fetch(`${BASE}/memories${qs ? `?${qs}` : ""}`, { headers: auth });
  if (!res.ok) throw new Error(`기억 조회 실패: ${res.status}`);
  const data = (await res.json()) as { memories?: Memory[] };
  return data.memories ?? [];
}

export async function patchMemory(id: string, patch: MemoryPatch): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${BASE}/memories/${id}`, {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return { ok: res.ok, status: res.status };
}

export async function deleteMemory(id: string): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${BASE}/memories/${id}`, { method: "DELETE", headers: auth });
  return { ok: res.ok, status: res.status };
}
