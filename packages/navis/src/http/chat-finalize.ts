import type { ServerResponse } from "node:http";
import { config } from "../config.js";
import type { AskResult } from "../claude/types.js";
import { sendJson } from "./respond.js";
import {
  consumeCancelled,
  consumeHandoff,
  persistAndNotify,
  type ChatSnapshot,
} from "./chat-turns.js";
import type { StreamState } from "./chat-guards.js";

// chat / chat-stream 공통 — 응답 메타(contextFull, 실제 사용 모델) 계산.
// contextFull 은 다음 턴에 세션 리셋 신호로 클라가 쓰고, model 은 앱이 모델 선택 반영
// 여부를 표시하는 데 쓴다. modelOverride 가 화이트리스트로 걸러진 값 또는 undefined
// 라는 전제 — undefined 면 askClaude 가 config.model 로 돈다.
export function turnMeta(
  result: AskResult,
  modelOverride: string | undefined,
): { contextFull: boolean; model: string } {
  return {
    contextFull: result.contextTokens >= config.contextTokenLimit,
    model: modelOverride ?? config.model,
  };
}

// finalizeTurn 이 필요로 하는 최소 컨텍스트 — chat.ts 의 ChatRequest 전체를 끌어들이지
// 않도록 사용 필드만 노출. backgroundable 분기 + 메타 계산용.
export type FinalizeContext = {
  turnId: string | undefined;
  conversationId: string | undefined;
  snapshot: ChatSnapshot | undefined;
  modelOverride: string | undefined;
};

// 완료 분기 — clientGone/handoff/cancelled 신호로 (영속+푸시) 와 (done 이벤트) 사이를
// 가른다. 어느 쪽이든 res 종료까지 책임진다.
export async function finalizeTurn(
  result: AskResult,
  ctx: FinalizeContext,
  res: ServerResponse,
  sse: (event: string, data: unknown) => void,
  state: StreamState,
): Promise<void> {
  const { contextFull, model } = turnMeta(result, ctx.modelOverride);
  // 클라가 응답 전에 떠났는가? 두 신호를 함께 본다:
  //  - clientGone: req 'close'(연결 종료). 프록시 뒤에선 안 뜰 수 있어 단독으론 불충분.
  //  - handedOff: 앱이 AppState 'background' 에서 보낸 명시적 핸드오프(신뢰 가능한 신호).
  const handedOff = ctx.turnId ? consumeHandoff(ctx.turnId) : false;
  if (state.clientGone || handedOff) {
    // 클라가 응답 전에 떠남 → 서버가 대신 대화에 답변을 써넣고(동기화로 복원) 폰 푸시.
    // 완료 직후 도착한 중지 신호가 있으면(consumeCancelled) 영속/푸시하지 않는다.
    const stopped = ctx.turnId ? consumeCancelled(ctx.turnId) : false;
    if (!stopped && ctx.conversationId && ctx.snapshot) {
      await persistAndNotify(ctx.conversationId, ctx.snapshot, {
        text: result.text,
        toolsUsed: result.toolsUsed,
        sessionId: result.sessionId,
      });
    }
    // 핸드오프인데 연결이 아직 열려 있을 수 있다 → 정리. done 은 보내지 않는다(클라는
    // 다음 동기화 pull 로 권위 응답을 받음, 중복 방지).
    if (!res.writableEnded) res.end();
    return;
  }
  // 권위 있는 최종 텍스트도 함께 보내 클라가 누적분을 보정하게 한다.
  sse("done", {
    text: result.text,
    sessionId: result.sessionId,
    contextFull,
    saved: result.saved,
    toolsUsed: result.toolsUsed,
    // 지연 계측(ms) — 앱/디버그에서 응답 속도 분해 확인용.
    timing: result.timing,
    // 이 턴에 실제로 사용된 모델 — 앱이 모델 선택이 반영됐는지 확인/표시.
    model,
  });
  if (!res.writableEnded) res.end();
}

// 스트림 에러 분기 — 명시 중지(abort)와 진짜 에러를 가른다. 명시 중지면 클라가 끊긴
// 스트림을 에러로 오인하지 않도록 'aborted' SSE 이벤트를 1회 보낸 뒤 종료한다.
// (헤더가 안 나간 경우는 sse 가 작동하지 않으니 그대로 res.end 만 한다.)
export function handleStreamError(
  err: unknown,
  res: ServerResponse,
  sse: (event: string, data: unknown) => void,
  ctrl: AbortController,
): void {
  if (ctrl.signal.aborted) {
    if (res.headersSent && !res.writableEnded) sse("aborted", { reason: "cancelled" });
    if (!res.writableEnded) res.end();
    return;
  }
  console.error("[chat/stream] 처리 실패:", err);
  if (!res.headersSent) {
    sendJson(res, 500, { error: "internal error" });
    return;
  }
  sse("error", { error: "internal error" });
  if (!res.writableEnded) res.end();
}
