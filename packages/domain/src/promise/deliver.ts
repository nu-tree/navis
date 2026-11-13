// 먼저 말 걸기 전달 — 약속은 만든 방에, 전하기는 "나비스" 방에 나비스가 먼저 말을 건다(specs/003 FR-022 · FR-023, specs/004).
//
// 사용자 말 없이 assistant 메시지 하나가 들어가고, 어디서 나왔는지가 붙는다 — 약속이면 origin(와이어로
// 나간다), 전하기면 relayId(저장만 한다, specs/004 research R8).
// 그 방의 세션은 비운다 — 세션은 이 메시지를 모르므로, 다음 대화 턴이 새 세션으로 시작해 최근
// 기록(이 메시지 포함)을 앞에 붙이게 한다(R8). 푸시는 기다리지 않는다 — 실패해도 메시지는 남았다.

import type { Message, MessageOrigin } from "@navis/validation";
import * as conversation from "../conversation/index";
import * as push from "../push/index";

/** 메시지의 출처. 약속은 origin, 전하기는 relayId. */
export type DeliverySource = { origin: MessageOrigin } | { relayId: string };

/**
 * 약속은 만든 방으로 온다(2026-11-13 사용자 결정). 그 방이 지워졌거나 없으면 "나비스" 방으로.
 * 전하기는 늘 "나비스" 방이다 — conversationId 를 넘기지 않는다.
 */
export async function deliveryRoom(userId: string, conversationId?: string | null): Promise<{ id: string; topic: string | null }> {
  if (conversationId) {
    const room = await conversation.findRoom(userId, conversationId);
    if (room) return room;
  }
  const main = await conversation.ensureMain(userId);
  return { id: main.id, topic: null };
}

export async function deliver(
  userId: string,
  source: DeliverySource,
  text: string,
  conversationId?: string | null,
): Promise<Message> {
  const main = await deliveryRoom(userId, conversationId);
  const message = await conversation.appendMessage(userId, main.id, { role: "assistant", text, ...source });
  await conversation.detachSession(userId, main.id);
  push
    .notify(userId, { title: "나비스", body: push.excerpt(text) || ("origin" in source ? source.origin.label : "나비스"), conversationId: main.id })
    .catch((err: unknown) => {
      console.error(`[promise] 푸시 실패: ${err instanceof Error ? err.message : String(err)}`);
    });
  return message;
}
