"use client";

import { useState } from "react";
import { RELAY_INSTRUCTION_MAX, type RelayItem } from "@navis/validation";
import { useCreateRelay } from "@/hooks/apis/relay/use-create-relay";
import { useRelayMembers } from "@/hooks/apis/relay/use-relay-members";

/** 말 걸기 화면의 보내기 칸 — 받는 사람 · 지시 · 보내기 · 다시 보내기. 화면은 이 값을 그리기만 한다. */
export const useRelayComposer = (enabled: boolean) => {
  const members = useRelayMembers(enabled);
  const { mutate, isPending } = useCreateRelay();
  const [recipientId, setRecipientId] = useState("");
  const [instruction, setInstruction] = useState("");

  const trimmed = instruction.trim();
  const canSend = Boolean(recipientId) && trimmed.length > 0 && trimmed.length <= RELAY_INSTRUCTION_MAX && !isPending;

  const send = () => {
    if (!canSend) return;
    mutate({ recipientId, instruction: trimmed }, { onSuccess: () => setInstruction("") });
  };

  /**
   * 실패한 것을 같은 받는 사람 · 지시로 다시 보낸다 — 새 기록이 생긴다(US3-2).
   * 기록에는 받는 사람의 표시만 있으므로 지금 회원 목록에서 같은 표시를 찾는다. 없으면 칸에 채워 고르게 한다.
   */
  const resend = (item: RelayItem) => {
    const member = members.data?.find((m) => m.label === item.to);
    if (member) {
      mutate({ recipientId: member.id, instruction: item.instruction });
      return;
    }
    setInstruction(item.instruction);
  };

  return {
    members: members.data ?? [],
    membersLoading: members.isLoading,
    membersError: members.error,
    recipientId,
    setRecipientId,
    instruction,
    setInstruction,
    maxLength: RELAY_INSTRUCTION_MAX,
    canSend,
    sending: isPending,
    send,
    resend,
  };
};

export type RelayComposer = ReturnType<typeof useRelayComposer>;
