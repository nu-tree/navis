import { config } from "../config.js";

// namory의 대화 동기화 REST(/conversations) 클라이언트.
const BASE = config.namoryMcpUrl.replace(/\/mcp\/?$/, "");
const auth = { Authorization: `Bearer ${config.namoryToken}` };

export async function listConversationsRemote(): Promise<unknown[]> {
  const res = await fetch(`${BASE}/conversations`, {
    headers: auth,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`대화 조회 실패: ${res.status}`);
  const data = (await res.json()) as { conversations?: unknown[] };
  return data.conversations ?? [];
}

export async function upsertConversationRemote(id: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}/conversations/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`대화 저장 실패: ${res.status}`);
}

export async function deleteConversationRemote(id: string): Promise<void> {
  const res = await fetch(`${BASE}/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: auth,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`대화 삭제 실패: ${res.status}`);
}
