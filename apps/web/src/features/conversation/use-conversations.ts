"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConversationSummary } from "@navis/validation";

/**
 * 방 목록과 선택 상태.
 *
 * 브라우저는 /api/* (BFF)만 부른다 — apps/server 의 토큰은 Next 서버에만 있다.
 */
export function useConversations() {
  const [rooms, setRooms] = useState<ConversationSummary[]>([]);
  // 열린 방은 항상 있다. 첫 렌더에 새 방 id 를 만들어 두고(지연 초기화), 서버에는
  // 첫 메시지를 보낼 때 POST /chat 이 만든다 — effect 로 만들면 연쇄 렌더가 된다.
  const [selectedId, setSelectedId] = useState<string>(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);

  /** 순수 조회. 상태를 건드리지 않아 effect 에서 바로 부를 수 있다. */
  const fetchRooms = useCallback(async (): Promise<ConversationSummary[]> => {
    const res = await fetch("/api/conversations");
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    return (await res.json()) as ConversationSummary[];
  }, []);

  const refresh = useCallback(async () => {
    try {
      setRooms(await fetchRooms());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [fetchRooms]);

  useEffect(() => {
    // 취소 플래그가 없으면 언마운트 뒤 늦게 온 응답이 상태를 덮는다.
    let cancelled = false;
    void fetchRooms().then(
      (rows) => {
        if (!cancelled) setRooms(rows);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchRooms]);

  /**
   * 새 방. 아직 서버에 만들지 않는다 — 첫 메시지를 보낼 때 POST /chat 이 만든다.
   * 방 생성 전용 엔드포인트를 두지 않은 이유이기도 하다(헌장 원칙 I).
   */
  const createDraft = useCallback(() => {
    setSelectedId(crypto.randomUUID());
  }, []);

  const select = useCallback((id: string) => setSelectedId(id), []);

  const remove = useCallback(
    async (id: string) => {
      // 낙관적으로 목록에서 먼저 뺀다 — 왕복을 기다리면 클릭이 굼떠 보인다.
      const previous = rooms;
      setRooms((prev) => prev.filter((r) => r.id !== id));
      // 열려 있던 방을 지웠으면 빈 방으로 옮긴다 — 지운 방을 계속 열어둘 수 없다.
      setSelectedId((cur) => (cur === id ? crypto.randomUUID() : cur));

      try {
        const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        // 404 는 이미 없다는 뜻이라 성공으로 친다 — 되살리면 사용자가 혼란스럽다.
        if (!res.ok && res.status !== 404) {
          throw new Error(await res.text().catch(() => res.statusText));
        }
      } catch (err) {
        // 실패하면 되돌린다. 지운 줄 알았는데 남아 있는 것보다 낫다.
        setRooms(previous);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [rooms],
  );

  return {
    rooms,
    selectedId,
    error,
    select,
    createDraft,
    remove,
    refresh,
  };
}
