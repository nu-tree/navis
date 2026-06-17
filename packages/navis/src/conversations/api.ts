import { namoryFetch } from "../namory-client.js";

// namory의 대화 동기화 REST(/conversations) 클라이언트.
// 대화 모음은 양이 커질 수 있어 호출부에서 25초 타임아웃을 명시한다(기본 10초로는 부족할 수 있음).

const CONV_TIMEOUT_MS = 25_000;

export async function listConversationsRemote(): Promise<unknown[]> {
  const res = await namoryFetch("/conversations", undefined, CONV_TIMEOUT_MS);
  if (!res.ok) throw new Error(`대화 조회 실패: ${res.status}`);
  const data = (await res.json()) as { conversations?: unknown[] };
  return data.conversations ?? [];
}

export async function upsertConversationRemote(id: string, body: unknown): Promise<void> {
  const res = await namoryFetch(
    `/conversations/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    CONV_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`대화 저장 실패: ${res.status}`);
}

export async function deleteConversationRemote(id: string): Promise<void> {
  const res = await namoryFetch(
    `/conversations/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    CONV_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`대화 삭제 실패: ${res.status}`);
}
