"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getConversationListQueryOptions, useConversationList } from "@/hooks/apis/conversation/use-conversation-list";
import { useRoomSeenStore } from "@/store/room-seen-store";
import { useSelectedConversationStore } from "@/store/selected-conversation-store";

/**
 * 열린 방 — 고른 방이 있으면 그 방, 없으면(또는 지워졌으면) "나비스"(메인) 방(2026-11-13: 주제 방).
 *
 * 메인 방 id 는 목록 조회가 만든다(서버 ensureMain). 오기 전엔 current 가 null — 그동안 패널을 그리지 않는다.
 * 초안 방을 잠깐 열어 두면 그 사이에 보낸 말이 엉뚱한 새 방으로 간다.
 */
export const useConversationWorkspace = () => {
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useConversationList();
  const selectedId = useSelectedConversationStore((s) => s.selectedId);
  const select = useSelectedConversationStore((s) => s.select);
  const main = rooms.find((r) => r.isMain) ?? null;
  const current = rooms.find((r) => r.id === selectedId) ?? main;

  // 사이드바의 새 메시지 점 — 처음 보는 방은 지금을 본 것으로, 열려 있는 방은 늘 본 것으로 적는다.
  const adopt = useRoomSeenStore((s) => s.adopt);
  const markSeen = useRoomSeenStore((s) => s.markSeen);
  useEffect(() => adopt(rooms), [rooms, adopt]);
  useEffect(() => {
    if (current) markSeen(current.id, current.updatedAt);
  }, [current, markSeen]);

  // 턴이 끝나면 제목·마지막 메시지·정렬이 바뀐다.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getConversationListQueryOptions.queryKey });

  return { rooms, current, select, refresh };
};
