// ── askClaude 오케스트레이션 ──────────────────────────────────────────────────
// 역할: 콜드 경로 한 턴의 조립부. 프롬프트 입력 조립(prompt-input) → prefetch →
// 시스템프롬프트/쿼리옵션 빌드 → query() for-await 실행(메시지 처리는
// message-processing 으로 위임) → 타이밍 로그/결과 반환. 워밍 경로(warm.ts)는
// 동일한 빌더/처리기를 공유하되 세션을 유지한다.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../../config.js";
import {
  buildChatSystemPrompt,
  buildChatQueryOptions,
} from "../query-options.js";
import type { AskClaudeOptions, AskResult } from "../types.js";
import { buildPromptInput } from "./prompt-input.js";
import {
  newTurnAccumulator,
  processChatMessage,
  type TurnCallbacks,
} from "./message-processing.js";

// 프롬프트 한 개를 Claude에 넣고 답변 + 세션 정보를 받는다.
// 옵션의 세부 의미는 AskClaudeOptions(./types.ts) 주석 참조 — 단일 옵션 객체로
// 통일해 호출부에서 undefined 6연속 같은 위치 인자 노이즈를 없앴다.
//
// 두뇌는 Claude Code 구독 OAuth 토큰(SDK가 process.env.CLAUDE_CODE_OAUTH_TOKEN을
// 자동 사용)으로 돌고, namory를 외부 MCP 서버로 붙여 recall/save 도구를 쥐여준다.
export async function askClaude(opts: AskClaudeOptions): Promise<AskResult> {
  const {
    prompt,
    env,
    resumeSessionId,
    images = [],
    allowProfileUpdate = false,
    projectContext,
    localExecution = false,
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
  const [connectors, baseSystemPrompt, guidance] = await env.prefetch();
  const prefetchMs = Date.now() - tPrefetch;

  // 시스템 프롬프트 + MCP/도구 — 콜드/워밍 공유 빌더로 동일 설정 보장.
  const systemPromptFinal = buildChatSystemPrompt(
    baseSystemPrompt,
    guidance,
    projectContext,
    localExecution,
  );

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
        ...buildChatQueryOptions(env, connectors, systemPromptFinal, {
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
