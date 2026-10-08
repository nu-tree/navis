"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getConversationListQueryOptions, useConversationList } from "@/hooks/apis/conversation/use-conversation-list";
import { useDeleteConversation } from "@/hooks/apis/conversation/use-delete-conversation";

/** 방 목록 + 열린 방 선택. 어느 방이 열려 있는지는 화면 상태라 서버에 두지 않는다. */
export const useConversationWorkspace = () => {
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useConversationList();
  const { mutate: deleteConversation } = useDeleteConversation();

  // 열린 방은 항상 있다. 첫 렌더에 새 방 id 를 만들어 두고(지연 초기화), 서버에는
  // 첫 메시지를 보낼 때 POST /chat 이 만든다 — 방 생성 전용 엔드포인트가 없는 이유다.
  const [selectedId, setSelectedId] = useState(() => crypto.randomUUID());

  const createDraft = () => setSelectedId(crypto.randomUUID());

  const remove = (id: string) => {
    // 열려 있던 방을 지우면 빈 방으로 옮긴다 — 지운 방을 계속 열어둘 수 없다.
    if (id === selectedId) createDraft();
    deleteConversation(id);
  };

  // 턴이 끝나면 제목·마지막 메시지·정렬이 바뀐다.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getConversationListQueryOptions.queryKey });

  return { rooms, selectedId, select: setSelectedId, createDraft, remove, refresh };
};
