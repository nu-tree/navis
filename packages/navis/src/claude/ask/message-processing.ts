// ── 턴 메시지 처리 ────────────────────────────────────────────────────────────
// 역할: 한 턴(콜드/워밍 공통)의 누적 상태 타입과, SDK 메시지를 한 개씩 받아
// accumulator 를 갱신하고 콜백을 호출하는 처리기. ask.ts 메인 턴과 warm.ts 워밍
// 세션이 동일한 처리 로직을 공유하도록 한 곳에 모은다.

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { richToolStatus } from "../tool-status.js";

// result 단계에서 subtype != "success" 로 떨어지는 turn-level 실패. 도구 호출이 이미
// 모두 끝난 뒤의 실패라, 워밍 경로에서 콜드로 재실행하면 같은 도구가 다시 호출되어
// 중복/이중 과금이 생긴다. 별도 타입으로 구분해 워밍 폴백 변환 대상에서 제외한다.
export class ResultFailureError extends Error {
  readonly subtype: string;
  constructor(subtype: string) {
    super(`Claude 응답 실패: ${subtype}`);
    this.name = "ResultFailureError";
    this.subtype = subtype;
  }
}

// 한 턴의 누적 상태. 콜드/워밍 공통.
export interface TurnAccumulator {
  text: string;
  sessionId: string;
  contextTokens: number;
  saved: boolean;
  toolsUsed: string[];
  firstMsgMs: number;
  // 클라이언트로 보낼 만한 출력(텍스트/생각/도구)을 한 번이라도 흘렸는지. 워밍 실패 시
  // 콜드 폴백을 해도 안전한지(델타 중복 안 남는지) 판정에 쓴다 — 첫 메시지(system init 등)
  // 수신만으론 출력이 아니므로 firstMsgMs 보다 정확하다.
  emitted: boolean;
  lastAssistantUsage?: {
    input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  // query() 시작 시각 — 첫 메시지까지(스폰+핸드셰이크 바닥) 측정용.
  tQuery: number;
}

export interface TurnCallbacks {
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
  onStatus?: (label: string) => void;
  onToolComplete?: (label: string) => void;
}

export function newTurnAccumulator(tQuery: number): TurnAccumulator {
  return { text: "", sessionId: "", contextTokens: 0, saved: false, toolsUsed: [], firstMsgMs: 0, emitted: false, tQuery };
}

// assistant 메시지의 content 배열에서 tool_use 블록만 뽑아 단일 포맷으로 반환.
// ask.ts(메인 턴 — 도구 라벨 수집/저장 감지)와 curator.ts(사후 큐레이터 — 저장 감지)가
// 각자 content 배열을 다시 순회하던 중복을 제거한다. content 가 배열이 아니거나
// assistant 가 아니면 빈 배열을 돌려줘 호출부가 분기를 더 안 둬도 안전하다.
export function iterToolUses(
  message: SDKMessage,
): { name: string; input: Record<string, unknown> }[] {
  if (message.type !== "assistant") return [];
  const content = message.message.content;
  if (!Array.isArray(content)) return [];
  const out: { name: string; input: Record<string, unknown> }[] = [];
  for (const block of content) {
    if (block.type === "tool_use") {
      out.push({ name: block.name, input: block.input as Record<string, unknown> });
    }
  }
  return out;
}

// SDK BetaMessage.usage 의 핵심 토큰 필드만 안전하게 추출한다.
// SDK 가 메시지 구조를 바꿔 usage 가 사라지면 워밍 세션 컨텍스트 한도 리셋
// (warm.ts: acc.contextTokens >= config.contextTokenLimit) 이 영영 트리거되지 않아
// 세션이 무한 증가하는 silent failure 가 생긴다. 그래서 타입 단언 대신 런타임 shape
// 가드로 형태를 확인하고, 깨졌으면 undefined 를 돌려 호출부가 1회만 경고 로그를
// 남기도록 한다(스팸 방지).
function extractAssistantUsage(
  message: unknown,
): TurnAccumulator["lastAssistantUsage"] | undefined {
  if (!message || typeof message !== "object") return undefined;
  const usage = (message as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  const numOrNullish = (v: unknown): v is number | null | undefined =>
    v === undefined || v === null || typeof v === "number";
  if (
    !numOrNullish(u.input_tokens) ||
    !numOrNullish(u.cache_read_input_tokens) ||
    !numOrNullish(u.cache_creation_input_tokens)
  ) {
    return undefined;
  }
  return {
    input_tokens: u.input_tokens ?? undefined,
    cache_read_input_tokens: u.cache_read_input_tokens ?? undefined,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? undefined,
  };
}

// usage 누락 경고는 프로세스 수명 동안 한 번만(메시지마다 찍으면 로그 스팸).
let warnedMissingUsage = false;

// SDK 메시지 한 개를 처리해 accumulator 갱신 + 콜백 호출. result 를 만나면 true 반환
// (이 턴 종료 신호) — 워밍은 이걸로 루프를 멈춘다(제너레이터를 닫지 않고). 콜드 경로는
// for-await 가 자연 종료하므로 반환값을 무시해도 된다.
export function processChatMessage(
  message: SDKMessage,
  acc: TurnAccumulator,
  cb: TurnCallbacks,
): boolean {
  // SDK 첫 메시지 도착 시점 — 스폰+핸드셰이크 바닥을 한 번만 기록.
  if (!acc.firstMsgMs) acc.firstMsgMs = Date.now() - acc.tQuery;

  if (message.type === "stream_event") {
    const ev = message.event;
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
      acc.emitted = true;
      if (cb.onTextDelta) cb.onTextDelta(ev.delta.text);
    }
    if (ev.type === "content_block_delta" && ev.delta.type === "thinking_delta") {
      acc.emitted = true;
      if (cb.onThinkingDelta) cb.onThinkingDelta(ev.delta.thinking);
    }
    if (ev.type === "content_block_start" && ev.content_block.type === "tool_use") {
      acc.emitted = true;
      if (cb.onStatus) cb.onStatus(ev.content_block.name);
    }
    return false;
  }

  if (message.type === "assistant") {
    for (const tu of iterToolUses(message)) {
      acc.emitted = true;
      if (tu.name === "mcp__namory__save") acc.saved = true;
      const label = richToolStatus(tu.name, tu.input);
      if (cb.onStatus) cb.onStatus(label);
      if (cb.onToolComplete) cb.onToolComplete(label);
      if (!acc.toolsUsed.includes(label)) acc.toolsUsed.push(label);
    }
    const u = extractAssistantUsage(message.message);
    if (u) {
      acc.lastAssistantUsage = u;
    } else if (!warnedMissingUsage) {
      warnedMissingUsage = true;
      console.warn(
        "[chat] assistant 메시지에서 usage 형태를 인식 못함 — contextTokens 측정 불가, 워밍 세션 컨텍스트 한도 리셋이 동작 안 할 수 있음(SDK 업데이트 필요?)",
      );
    }
    return false;
  }

  if (message.type === "result") {
    acc.sessionId = message.session_id;
    // 현재 컨텍스트 크기 = 마지막 assistant 호출의 프롬프트 토큰 합(누적 result.usage 는 부정확).
    const u = acc.lastAssistantUsage ?? {};
    acc.contextTokens =
      (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    if (message.subtype === "success") {
      acc.text = message.result;
    } else {
      throw new ResultFailureError(message.subtype);
    }
    return true;
  }

  return false;
}
