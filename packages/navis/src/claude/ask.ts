import {
  query,
  type SDKUserMessage,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config.js";
import { getChatPrefetch } from "./prefetch.js";
import { richToolStatus } from "./tool-status.js";
import { applySaveNudge } from "./nudge.js";
import {
  buildChatSystemPrompt,
  buildChatQueryOptions,
} from "./query-options.js";
import type { AskClaudeOptions, AskResult, InputImage } from "./types.js";

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

// askClaude 의 프롬프트 조립을 한 곳에 모은다: 너지 키워드 → history 합성 → 이미지가
// 있으면 user content block 배열로 감싼 async iterable. 옛 askClaude 안에서 인라인으로
// 흩어져 있어 가독성이 낮았고, 워밍 경로가 이 단계를 우회한다는 사실도 한눈에 안 보였다.
// 반환은 SDK 가 받는 string 또는 AsyncIterable<SDKUserMessage> 둘 중 하나.
export function buildPromptInput(opts: {
  prompt: string;
  historyContext?: string;
  images?: InputImage[];
}): string | AsyncGenerator<SDKUserMessage> {
  // 키워드 너지(B): 사용자 메시지에 결정/약속/할 일/배움 신호가 보이면 메인 턴에도
  // save 호출을 상기시키는 가벼운 힌트를 앞에 붙인다. 사후 큐레이터(A)가 그물이지만
  // 메인 턴에서 잡으면 응답 흐름 안에서 자연스럽게 저장돼 UX가 매끄럽다.
  const nudgedPrompt = applySaveNudge(opts.prompt);

  // historyContext 는 사용자가 아닌 채널 로그라 nudge 키워드 매칭 대상이 아니다.
  // 그래서 nudge 적용 후에 합친다.
  const promptWithHistory = opts.historyContext
    ? `[참고: 이 채널의 최근 메시지 — 'navis' 는 너 자신의 직전 발화/자동 보고. 새 세션이라 맥락 보강용으로 붙여둠. 사용자의 이번 질문은 아래 "[현재 메시지]" 블록.]\n${opts.historyContext}\n\n[현재 메시지]\n${nudgedPrompt}`
    : nudgedPrompt;

  // 이미지가 있으면 content block 배열로 구성해 user 메시지 하나를 yield 한다.
  // 없으면 기존처럼 문자열 prompt 그대로(가장 단순한 경로).
  const images = opts.images ?? [];
  return images.length > 0 ? buildImageMessage(promptWithHistory, images) : promptWithHistory;
}

// 프롬프트 한 개를 Claude에 넣고 답변 + 세션 정보를 받는다.
// 옵션의 세부 의미는 AskClaudeOptions(./types.ts) 주석 참조 — 단일 옵션 객체로
// 통일해 호출부에서 undefined 6연속 같은 위치 인자 노이즈를 없앴다.
//
// 두뇌는 Claude Code 구독 OAuth 토큰(SDK가 process.env.CLAUDE_CODE_OAUTH_TOKEN을
// 자동 사용)으로 돌고, namory를 외부 MCP 서버로 붙여 recall/save 도구를 쥐여준다.
export async function askClaude(opts: AskClaudeOptions): Promise<AskResult> {
  const {
    prompt,
    resumeSessionId,
    images = [],
    allowProfileUpdate = false,
    projectContext,
    historyContext,
    onTextDelta,
    onThinkingDelta,
    onStatus,
    onToolComplete,
    modelOverride,
    abortController,
  } = opts;
  // 지연 계측 — 채팅 속도 진단. 전 구간 시작점.
  const t0 = Date.now();

  // 프롬프트 조립(너지·history·이미지) — 단일 헬퍼로 추출(buildPromptInput).
  const promptInput = buildPromptInput({ prompt, historyContext, images });

  // in-process MCP 서버들(cron/repo/self_modify/settings/google)은 모듈 최상단에서
  // 한 번만 초기화한 캐시를 그대로 쓴다 — askClaude 가 호출될 때마다 다시 짜지 않는다.

  // 동적 MCP 커넥터(claude.ai 스타일). namory DB 에 등록된 외부 HTTP MCP 서버들을
  // 코드 수정 없이 이 query 에 주입한다. 인증(none/apikey/oauth)은 store/mcp 에서 처리.
  // 조회 실패 시 빈 결과라 연동 없이 안전 동작.
  // 커넥터/시스템프롬프트/프로젝트가이드 — TTL 캐시(prefetch.ts)로 가져온다. 매 턴
  // namory 3회 왕복을 핫패스에서 없애, 버스트 시 namory 지연이 이벤트 루프를 압박해
  // 생기는 death-spiral 을 막는다(설정 변경은 TTL 내 반영).
  const tPrefetch = Date.now();
  const [connectors, baseSystemPrompt, guidance] = await getChatPrefetch();
  const prefetchMs = Date.now() - tPrefetch;

  // 시스템 프롬프트 + MCP/도구 — 콜드/워밍 공유 빌더로 동일 설정 보장.
  const systemPromptFinal = buildChatSystemPrompt(baseSystemPrompt, guidance, projectContext);

  // query() 시작 시각 — 첫 메시지까지가 CLI 스폰 + MCP 핸드셰이크 바닥(모델 무관).
  const tQuery = Date.now();
  const acc = newTurnAccumulator(tQuery);
  const cb: TurnCallbacks = { onTextDelta, onThinkingDelta, onStatus, onToolComplete };
  // query() for-await 실행 구간 — SDK·CLI·MCP 트랜스포트 어느 층에서 던지든 여기서
  // 한 번에 잡아 명시적으로 처리한다. abort 면 그대로 전파(상위에서 의도적 중지로 다룸),
  // 그 외에는 부분 출력 이후라면 사용자 메시지 정합성을 위해 '말풍선 끊김' 마커를
  // 흘려보낸 뒤 의미 있는 에러로 다시 던진다(상위 SSE 에러 이벤트로 변환됨).
  try {
    for await (const message of query({
      prompt: promptInput,
      options: {
        model: modelOverride ?? config.model,
        // 확장 사고(adaptive) — 모델이 필요하다고 판단할 때만 스스로 생각한다. 생각 과정은
        // 스트리밍 콜백이 있을 때(앱 채팅)만 켜서 접이식 '생각 과정' 블록으로 보여준다.
        // 콜백 없는 경로(크론/다이제스트/CLI)는 기본 동작 유지(불필요한 지연·비용 회피).
        // effort 기본값(high)은 '안녕' 같은 인사에도 첫 토큰을 ~1.5초 늦춘다(실측:
        // high 4.0s → medium 2.6s). 채팅은 응답성이 우선이라 medium 으로 고정 —
        // adaptive 라 어려운 질문엔 여전히 생각 블록이 붙는다.
        ...(onThinkingDelta
          ? { thinking: { type: "adaptive" as const }, effort: "medium" as const }
          : {}),
        // 공통 옵션(systemPrompt/mcpServers/allowedTools/settingSources/maxTurns/
        // includePartialMessages/abortController/resume)은 콜드/워밍 공유 빌더로 통일.
        ...buildChatQueryOptions(connectors, systemPromptFinal, {
          resume: resumeSessionId,
          abortController,
          allowProfileUpdate,
          // 스트리밍 콜백이 있으면 부분 메시지(text_delta)를 받기 위해 켠다.
          includePartial: !!onTextDelta,
        }),
      },
    })) {
      // 메시지 처리(델타·도구·result)는 콜드/워밍 공유 처리기로.
      processChatMessage(message, acc, cb);
    }
  } catch (err) {
    // 사용자가 중지 버튼을 누른 경우 — 의도된 종료, 상위로 그대로 전파(SSE 가 조용히 닫음).
    if (abortController?.signal.aborted) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[chat] query 실패 model=${modelOverride ?? config.model} emitted=${acc.emitted}: ${msg}`,
    );
    // 부분 출력 이후 실패 — 사용자가 잘린 답변을 진짜 응답으로 오해하지 않도록 짧은
    // 마커를 한 번 더 흘려보낸다. 스트리밍 콜백이 있을 때만(콜드 스트림 경로).
    if (acc.emitted && onTextDelta) {
      try {
        onTextDelta("\n\n⚠️ (응답 도중 오류로 끊겼어요)");
      } catch {
        /* 콜백 자체가 죽으면 무시 — 어차피 throw 로 상위가 처리 */
      }
    }
    throw new Error(`Claude 응답 실패: ${msg}`);
  }

  const totalMs = Date.now() - t0;
  // 한 줄 진단 로그(Railway 로그에서 어디서 시간이 새는지 바로 확인).
  console.log(
    `[chat:timing] model=${modelOverride ?? config.model} prefetch=${prefetchMs}ms firstMsg=${acc.firstMsgMs}ms total=${totalMs}ms tools=${acc.toolsUsed.length}`,
  );
  return {
    text: acc.text.trim() || "(빈 응답)",
    sessionId: acc.sessionId,
    contextTokens: acc.contextTokens,
    saved: acc.saved,
    toolsUsed: acc.toolsUsed,
    timing: { prefetchMs, firstMsgMs: acc.firstMsgMs, totalMs },
  };
}

// 텍스트(있으면) + 이미지들을 하나의 user 메시지로 묶어 yield 하는 async generator.
// query()의 streaming-input 모드는 prompt로 AsyncIterable<SDKUserMessage>를 받는다.
async function* buildImageMessage(
  text: string,
  images: InputImage[],
): AsyncGenerator<SDKUserMessage> {
  const content = [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType,
        data: img.data,
      },
    })),
  ];

  yield {
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
  };
}

