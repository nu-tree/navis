"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getConversationListQueryOptions, useConversationList } from "@/hooks/apis/conversation/use-conversation-list";

/**
 * 열린 방 — 늘 "나비스" 방 하나다(specs/003 R9, 2026-10-14 사용자 결정).
 *
 * 비서와의 대화는 하나로 이어진다. 방 목록 · 새 대화는 숨겼다. 예전 방들은 DB 에 그대로 있다 —
 * 지우지 않았다. 오래된 맥락은 기억이 잇는다.
 *
 * 메인 방 id 는 목록 조회가 만든다(서버 ensureMain). 오기 전엔 null — 그동안 패널을 그리지 않는다.
 * 초안 방을 잠깐 열어 두면 그 사이에 보낸 말이 엉뚱한 새 방으로 간다.
 */
export const useConversationWorkspace = () => {
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useConversationList();
  const mainId = rooms.find((r) => r.isMain)?.id ?? null;

  // 턴이 끝나면 제목·마지막 메시지·정렬이 바뀐다.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getConversationListQueryOptions.queryKey });

  return { mainId, refresh };
};
