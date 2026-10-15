// 먼저 말 걸기 전달 — "나비스" 방에 나비스가 먼저 말을 건다(specs/003 FR-022 · FR-023, specs/004).
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

export async function deliver(userId: string, source: DeliverySource, text: string): Promise<Message> {
  const main = await conversation.ensureMain(userId);
  const message = await conversation.appendMessage(userId, main.id, { role: "assistant", text, ...source });
  await conversation.detachSession(userId, main.id);
  push
    .notify(userId, { title: "나비스", body: push.excerpt(text) || ("origin" in source ? source.origin.label : "나비스"), conversationId: main.id })
    .catch((err: unknown) => {
      console.error(`[promise] 푸시 실패: ${err instanceof Error ? err.message : String(err)}`);
    });
  return message;
}
