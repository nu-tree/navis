// 약속 한 회차 실행 — 평소와 같은 에이전트 턴을 약속 모드로 돌린다(specs/003 R5).
//
// 세션을 잇지 않는다: 매 실행이 새 세션이다. 약속끼리 맥락이 섞이지 않고, "나비스" 방의 대화 세션을
// 건드리지 않는다. 대신 그 방의 최근 대화를 앞에 붙여 지금 사용자와 무슨 얘기 중인지 알게 한다.
//
// 결과는 셋 중 하나다 — 말함(notify 를 불렀다) · 조용함(부르지 않았다) · 실패. 이 함수는 던지지 않는다:
// 실행 하나가 실패해도 같은 tick 의 다른 약속은 돌아야 한다.

import type { Message } from "@navis/validation";
import { runTurn } from "../chat/index";
import * as conversation from "../conversation/index";
import { deliver } from "./deliver";
import { complete, formatKst, previousRun, type ClaimedRun, type RunOutcome } from "./index";
import type { PromiseRunState } from "./mcp";

/** 약속 턴에 붙이는 "나비스" 방 최근 대화 수. 대화 턴의 기록 복원과 같은 한도. */
const HISTORY_MESSAGES = 20;

/** 약속 턴의 프롬프트 — 실행 때의 나비스가 이것만 보고 할 일을 안다. 순수 함수. */
export const promisePrompt = (
  run: Pick<ClaimedRun, "scheduledFor" | "promise">,
  now: Date,
  previous: { startedAt: string; status: string; error: string | null } | null,
): string =>
  [
    "[약속 실행]",
    `지시: ${run.promise.instruction}`,
    `메모: ${run.promise.memo || "(없음)"}`,
    `예정: ${formatKst(run.scheduledFor)} / 실제: ${formatKst(now)}`,
    `지난 실행: ${
      previous
        ? `${formatKst(new Date(previous.startedAt))} ${previous.status}${previous.error ? `(${previous.error})` : ""}`
        : "없음(첫 실행)"
    }`,
  ].join("\n");

export type RunResult = { promiseId: string; status: RunOutcome["status"] };

export async function executeRun(run: ClaimedRun, now: Date = new Date()): Promise<RunResult> {
  const { promise } = run;
  const state: PromiseRunState = {};
  const outcome = await (async (): Promise<RunOutcome> => {
    try {
      const main = await conversation.ensureMain(promise.userId);
      const history: Message[] = await conversation.recentForHistory(promise.userId, main.id, HISTORY_MESSAGES);
      const previous = await previousRun(promise.id, run.runId);
      await runTurn({
        userId: promise.userId,
        prompt: promisePrompt(run, now, previous),
        history,
        promiseRun: { promiseId: promise.id, label: promise.label, state },
      });
      return state.messageId
        ? { status: "spoke", messageId: state.messageId }
        : { status: "silent" };
    } catch (err) {
      // 토큰 미등록 · 거절도 여기로 온다. 그 문구가 곧 사용자가 고칠 방법이다(R11).
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[promise] 실행 실패 promise=${promise.id}: ${error}`);
      // notify 를 이미 했다면 말한 것은 사실이다 — 기록은 실패로 두되 메시지 id 는 남긴다.
      return { status: "failed", error, ...(state.messageId ? { messageId: state.messageId } : {}) };
    }
  })();

  const memoAndFinish = {
    ...(state.memo !== undefined ? { memo: state.memo } : {}),
    ...(state.finished ? { finished: true } : {}),
  };

  try {
    const { disabledByFailures } = await complete(run, { ...outcome, ...memoAndFinish });
    if (disabledByFailures) {
      // 연속 실패로 꺼졌다 — 조용히 꺼지면 사용자는 약속이 왜 안 오는지 모른다(R11). 한 번 알린다.
      await deliver(
        promise.userId,
        { kind: "promise-disabled", promiseId: promise.id, label: promise.label },
        `'${promise.label}' 약속이 세 번 연속 실패해서 껐어요. 이유: ${outcome.error ?? "알 수 없음"}\n약속 화면에서 다시 켤 수 있어요.`,
      );
    }
  } catch (err) {
    // 마무리를 못 하면 임대가 만료된 뒤 다시 집힌다(R3). 여기서 던지지 않는다.
    console.error(
      `[promise] 마무리 실패 promise=${promise.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { promiseId: promise.id, status: outcome.status };
}
