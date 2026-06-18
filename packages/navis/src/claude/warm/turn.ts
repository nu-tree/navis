// ── 워밍 세션: 턴 실행 ───────────────────────────────────────────────────────
// 한 턴을 살아있는 워밍 세션으로 실행하는 핵심 루프(runWarmTurn)와, 실패를
// 콜드 폴백/전파로 분류하는 헬퍼(classifyWarmError), 외부 폐기 진입점(dropWarmSession).

import { config } from "../../config.js";
import { applySaveNudge } from "../nudge.js";
import {
  newTurnAccumulator,
  processChatMessage,
  ResultFailureError,
  type TurnAccumulator,
  type TurnCallbacks,
} from "../ask.js";
import type { AskResult } from "../types.js";
import { TURN_TIMEOUT_MS, WarmCapacity, WarmFallback } from "./config.js";
import {
  acquireNewSession,
  dropSession,
  sessions,
  userMessage,
} from "./session.js";

// runWarmTurn 의 catch 에서 던질 에러를 4갈래로 분류한다:
//  - WarmFallback: 호출부가 콜드 폴백 — 워밍 시작 전 실패였거나, 출력 전(=델타 중복 위험 없음).
//  - ResultFailureError: turn-level 실패라 콜드 재실행하면 같은 도구가 중복 호출돼 이중 과금.
//    그대로 전파(상위는 일반 에러로 사용자에게 보고).
//  - emitted 후 기타 에러: 부분 출력이 이미 클라로 나간 뒤 → 폴백 불가, 일반 에러로 전파.
//  - emitted 전 기타 에러: 출력 안 흘렸으니 콜드 폴백이 안전.
// catch 안에 인라인으로 두면 4갈래 분기가 한눈에 안 들어와 헬퍼로 추출.
function classifyWarmError(err: unknown, acc: TurnAccumulator): Error {
  if (err instanceof WarmFallback) return err;
  if (err instanceof ResultFailureError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (!acc.emitted) return new WarmFallback(`turn-error: ${msg}`);
  // 이미 델타가 흘러나간 뒤라 폴백 불가 — 원본 Error 가 있으면 그대로, 아니면 감싸서 전파.
  return err instanceof Error ? err : new Error(msg);
}

// 한 턴을 워밍 세션으로 실행. 실패가 스트리밍 시작 전이면 WarmFallback 을 던져 호출부가
// 콜드 askClaude 로 안전하게 폴백하게 한다.
export async function runWarmTurn(opts: {
  conversationId: string;
  prompt: string;
  model: string;
  // 앱이 보낸 resume(직전 SDK 세션 id). 세션의 것과 다르면 리셋으로 보고 폐기+재생성.
  resume: string | undefined;
  callbacks: TurnCallbacks;
}): Promise<AskResult> {
  const { conversationId, prompt, model, resume, callbacks } = opts;

  let session = sessions.get(conversationId);
  // 점유 중이 아닌 세션만 stale(모델 변경·세션 리셋) 판정 후 폐기 — 점유 중이면 아래
  // claim 에서 busy 폴백된다.
  if (session && !session.busy) {
    const stale =
      session.model !== model || (session.sdkSessionId !== "" && resume !== session.sdkSessionId);
    if (stale) {
      dropSession(conversationId);
      session = undefined;
    }
  }

  if (!session) {
    try {
      session = await acquireNewSession(conversationId, model, resume);
    } catch (err) {
      dropSession(conversationId);
      // 용량 초과(모든 세션이 busy) — 새 세션을 강제로 만들면 상한이 무너진다. 콜드 폴백.
      if (err instanceof WarmCapacity) {
        throw new WarmFallback("capacity-full");
      }
      throw new WarmFallback(`create-failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 단일 비행 claim — await 직후 동기 구간에서 원자적으로. 이미 다른 턴이 점유 중이면
  // (같은 대화 동시 요청, 또는 방금 같은 새 세션을 받은 경쟁 호출) 이 턴은 콜드로.
  if (session.busy) throw new WarmFallback("busy");
  session.busy = true;

  const t0 = Date.now();
  const acc = newTurnAccumulator(t0);
  // 턴 wall-clock 상한 — result 가 영영 안 와도 무한 행을 막는다(타임아웃 시 세션 폐기).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("warm-turn-timeout")), TURN_TIMEOUT_MS);
  });
  try {
    session.push(userMessage(applySaveNudge(prompt)));
    for (;;) {
      // Promise.race 의 패자 쪽(주로 next())이 나중에 reject 하면 unhandled rejection 이
      // 되므로 미리 .catch 부착. 결과 자체는 racer 가 본다.
      const nextPromise = session.q.next();
      nextPromise.catch(() => {});
      const next = await Promise.race([nextPromise, timeout]);
      if (next.done) throw new Error("워밍 세션 조기 종료");
      if (processChatMessage(next.value, acc, callbacks)) break; // result 도달 → 턴 종료
    }
  } catch (err) {
    session.busy = false;
    dropSession(conversationId);
    // 4갈래 분기는 classifyWarmError 헬퍼로(WarmFallback / ResultFailureError / emitted 후 / 그 외).
    throw classifyWarmError(err, acc);
  } finally {
    if (timer) clearTimeout(timer);
  }

  session.busy = false;
  session.lastUsed = Date.now();
  session.sdkSessionId = acc.sessionId;
  const totalMs = Date.now() - t0;
  console.log(
    `[chat:timing] WARM model=${model} firstMsg=${acc.firstMsgMs}ms total=${totalMs}ms tools=${acc.toolsUsed.length} conv=${conversationId.slice(0, 8)}`,
  );

  // 컨텍스트가 한도를 넘으면 다음 턴은 새 세션으로(앱도 contextFull 로 세션을 리셋한다).
  if (acc.contextTokens >= config.contextTokenLimit) dropSession(conversationId);

  return {
    text: acc.text.trim() || "(빈 응답)",
    sessionId: acc.sessionId,
    contextTokens: acc.contextTokens,
    saved: acc.saved,
    toolsUsed: acc.toolsUsed,
    // prefetch 는 세션 생성 시 1회뿐이라 턴 단위론 0 으로 보고(워밍 이득은 firstMsg 에 드러남).
    timing: { prefetchMs: 0, firstMsgMs: acc.firstMsgMs, totalMs },
  };
}

// 대화가 끊겼을 때(중지·삭제) 워밍 세션을 즉시 폐기 — 외부에서 호출.
export function dropWarmSession(conversationId: string): void {
  dropSession(conversationId);
}
