// 약속 메시지 전달 — "나비스" 방에 나비스가 먼저 말을 건다(specs/003 FR-022 · FR-023).
//
// 사용자 말 없이 assistant 메시지 하나가 들어가고, 어느 약속에서 나왔는지(origin)가 붙는다.
// 그 방의 세션은 비운다 — 세션은 이 메시지를 모르므로, 다음 대화 턴이 새 세션으로 시작해 최근
// 기록(이 메시지 포함)을 앞에 붙이게 한다(R8). 푸시는 기다리지 않는다 — 실패해도 메시지는 남았다.

import type { Message, MessageOrigin } from "@navis/validation";
import * as conversation from "../conversation/index";
import * as push from "../push/index";

export async function deliver(userId: string, origin: MessageOrigin, text: string): Promise<Message> {
  const main = await conversation.ensureMain(userId);
  const message = await conversation.appendMessage(userId, main.id, { role: "assistant", text, origin });
  await conversation.detachSession(userId, main.id);
  push
    .notify(userId, { title: "나비스", body: push.excerpt(text) || origin.label, conversationId: main.id })
    .catch((err: unknown) => {
      console.error(`[promise] 푸시 실패: ${err instanceof Error ? err.message : String(err)}`);
    });
  return message;
}
