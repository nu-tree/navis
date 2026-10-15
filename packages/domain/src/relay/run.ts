// 전하기 한 건 실행 — 받는 회원의 맥락 + 보낸 관리자의 토큰으로 에이전트 턴 하나(specs/004 research R3 · R7).
//
// 약속 턴처럼 새 세션이다. 받는 회원 "나비스" 방의 최근 대화를 앞에 붙여 지금 무슨 얘기 중인지 알게 한다.
// 결과는 둘 — 전함(deliver 를 불렀다) · 실패(안 불렀거나 오류). 전하기에는 "조용함"이 없다(FR-013).
// 이 함수는 던지지 않는다: 하나가 실패해도 같은 tick 의 다른 실행은 돌아야 한다.

import type { Message } from "@navis/validation";
import { runTurn } from "../chat/index";
import * as conversation from "../conversation/index";
import { complete, type ClaimedRelay, type RelayOutcome } from "./index";
import type { RelayRunState } from "./mcp";

/** 전하기 턴에 붙이는 "나비스" 방 최근 대화 수. 약속 턴과 같다. */
const HISTORY_MESSAGES = 20;

/** 전하기 턴의 프롬프트. 누가 맡겼는지는 넣지 않는다 — 모델이 밝힐 근거는 지시 문장 안에만 있어야 한다. */
export const relayPrompt = (instruction: string): string => ["[전하기]", `지시: ${instruction}`].join("\n");

export type RelayResult = { relayId: string; status: RelayOutcome["status"] };

export async function executeRelay(run: ClaimedRelay): Promise<RelayResult> {
  const state: RelayRunState = {};
  const outcome = await (async (): Promise<RelayOutcome> => {
    try {
      const main = await conversation.ensureMain(run.recipientId);
      const history: Message[] = await conversation.recentForHistory(run.recipientId, main.id, HISTORY_MESSAGES);
      await runTurn({
        userId: run.recipientId,
        tokenUserId: run.senderId,
        prompt: relayPrompt(run.instruction),
        history,
        relayRun: { relayId: run.id, state },
      });
      return state.messageId
        ? { status: "delivered", messageId: state.messageId }
        : { status: "failed", error: "나비스가 전하지 않았어요." };
    } catch (err) {
      // ★ 실패 이유에는 오류 문구만 쓴다 — 모델 출력은 받는 회원의 기억이 섞일 수 있어 관리자에게 넘기지 않는다(R9).
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[relay] 실행 실패 relay=${run.id}: ${error}`);
      // deliver 를 이미 했다면 전한 것은 사실이다.
      return state.messageId ? { status: "delivered", messageId: state.messageId } : { status: "failed", error };
    }
  })();

  try {
    await complete(run.id, outcome);
  } catch (err) {
    console.error(`[relay] 기록 실패 relay=${run.id}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { relayId: run.id, status: outcome.status };
}
