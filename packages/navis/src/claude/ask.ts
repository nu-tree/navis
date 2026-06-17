import {
  query,
  type SDKUserMessage,
  type SDKMessage,
  type McpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config.js";
import { buildCronTools, CRON_TOOL_NAMES } from "../cron/mcp.js";
import { buildRepoTools, REPO_TOOL_NAMES } from "../repo/mcp.js";
import { buildSelfModifyTools, SELF_MODIFY_TOOL_NAMES } from "../self-modify/mcp.js";
import { buildSettingsTools, SETTINGS_TOOL_NAMES } from "../settings/mcp.js";
import { type BuiltConnectors } from "../connectors/mcp.js";
import { httpMcp } from "./mcp.js";
import { getChatPrefetch } from "./prefetch.js";
import { buildGoogleTools, GOOGLE_TOOL_NAMES } from "../google/mcp.js";
import { isCalendarEnabled } from "../google/auth.js";
import {
  BUILTIN_TOOLS,
  NAMORY_PROFILE_UPDATE_TOOL,
  NAMORY_TOOLS,
} from "./allowed-tools.js";
import { applySaveNudge } from "./nudge.js";
import type { AskClaudeOptions, AskResult, InputImage } from "./types.js";

// in-process MCP 서버 빌더들 — 상태가 변하지 않아 매 요청마다 다시 짜지 않는다.
// 빌더 호출은 도구 메타 등록만 하지 외부 I/O 가 없어 모듈 로드 시 만들어도 안전.
// 캐싱으로 첫 토큰 지연을 줄인다(이전엔 매 askClaude 호출마다 5개 서버를 재구성).
const cronServer = buildCronTools();
const repoServer = buildRepoTools();
const selfModifyServer = buildSelfModifyTools();
const settingsServer = buildSettingsTools();
// 구글은 env(client/secret/refresh) 셋이 모두 채워졌을 때만 활성 — 환경변수는 프로세스
// 수명 동안 안 바뀌므로 모듈 로드 시점에 한 번만 판정해도 충분.
const googleServer = isCalendarEnabled() ? buildGoogleTools() : undefined;

// ── 채팅 query 설정 빌더 (콜드 askClaude · 워밍 세션이 공유) ──────────────────────
// mcpServers/allowedTools/systemPrompt 는 보안·동작에 직결되므로 한 곳에서 만들어
// 두 경로(매 메시지 askClaude, 지속 워밍 세션 warm.ts)가 절대 어긋나지 않게 한다.

// 시스템 프롬프트: 기본 + (프로젝트 컨텍스트) + 원격 실행 안내 + 프로젝트 표기 가이던스.
export function buildChatSystemPrompt(
  baseSystemPrompt: string,
  guidance: string,
  projectContext?: string,
): string {
  let s = projectContext
    ? `${baseSystemPrompt}\n\n[운영 컨텍스트] 현재 작업 프로젝트: "${projectContext}". 이 대화에서 mcp__namory__save 를 호출할 때 모든 항목에 project: "${projectContext}" 를 명시할 것.`
    : baseSystemPrompt;
  // 원격 실행(Railway 컨테이너) 운영 안내 — 소스 파일이 없어 자기 코드 직접 수정 불가.
  s +=
    "\n\n[원격 실행 안내]\n" +
    "- 이 환경(Railway 컨테이너)에는 소스 파일이 없다. Edit/Write/Bash 로 이 모노레포 코드(packages/** — navis, namory, app, desktop 등)를 직접 수정하려 시도하지 말 것.\n" +
    "- 코드 수정 요청(어느 패키지든)은 반드시 mcp__self_modify__request_self_modification 도구로 GitHub Actions 의 코드 수정 서브에이전트에게 위임. 즉시 트리거만 던지면 작업·검토 결과는 별도 보고로 전달됨.\n" +
    "- 자기 코드 조회는 mcp__repo__read_repo_file / mcp__repo__list_repo_files 사용.\n" +
    "- 사용자 시스템의 다른 파일·셸 작업은 평소대로 허용(자기 수정만 위임).";
  s += guidance;
  return s;
}

// MCP 서버 묶음: 동적 커넥터(있으면) + namory(항상 로드) + 내장 in-process 서버들.
export function buildChatMcpServers(
  connectors: BuiltConnectors,
): Record<string, McpServerConfig> {
  return {
    // DB 등록 커넥터들(있을 때만)을 먼저 펼친다 — 내장 서버 키(namory/cron/...)가
    // 항상 이기도록(같은 id 면 아래 내장 정의가 덮음). 등록 단계에서도 예약어를 거부한다.
    ...connectors.servers,
    // namory MCP — 공유 헬퍼(httpMcp)로 alwaysLoad+Bearer 헤더를 단일 출처에서 만든다.
    namory: httpMcp({ url: config.namoryMcpUrl, token: config.namoryToken }),
    cron: cronServer,
    repo: repoServer,
    self_modify: selfModifyServer,
    settings: settingsServer,
    ...(googleServer ? { google: googleServer } : {}),
  };
}

// 자동 승인 도구 목록. profile_update는 신뢰된 다이제스트 경로에서만 추가.
export function buildChatAllowedTools(
  connectors: BuiltConnectors,
  allowProfileUpdate: boolean,
): string[] {
  return [
    ...NAMORY_TOOLS,
    ...(allowProfileUpdate ? [NAMORY_PROFILE_UPDATE_TOOL] : []),
    ...CRON_TOOL_NAMES,
    ...REPO_TOOL_NAMES,
    ...SELF_MODIFY_TOOL_NAMES,
    ...SETTINGS_TOOL_NAMES,
    ...(googleServer ? GOOGLE_TOOL_NAMES : []),
    // 동적 커넥터: "mcp__<id>" 와일드카드로 각 커넥터의 모든 도구를 자동 승인.
    ...connectors.allowedTools,
    ...BUILTIN_TOOLS,
  ];
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
    const content = message.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_use") {
          acc.emitted = true;
          if (block.name === "mcp__namory__save") acc.saved = true;
          const label = richToolStatus(block.name, block.input as Record<string, unknown>);
          if (cb.onStatus) cb.onStatus(label);
          if (cb.onToolComplete) cb.onToolComplete(label);
          if (!acc.toolsUsed.includes(label)) acc.toolsUsed.push(label);
        }
      }
    }
    const u = (message.message as unknown as { usage?: TurnAccumulator["lastAssistantUsage"] }).usage;
    if (u) acc.lastAssistantUsage = u;
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
      throw new Error(`Claude 응답 실패: ${message.subtype}`);
    }
    return true;
  }

  return false;
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

  // 키워드 너지(B): 사용자 메시지에 결정/약속/할 일/배움 신호가 보이면 메인 턴에도
  // save 호출을 상기시키는 가벼운 힌트를 앞에 붙인다. 사후 큐레이터(A)가 그물이지만
  // 메인 턴에서 잡으면 응답 흐름 안에서 자연스럽게 저장돼 UX가 매끄럽다.
  const nudgedPrompt = applySaveNudge(prompt);

  // historyContext 는 사용자가 아닌 채널 로그라 nudge 키워드 매칭 대상이 아니다.
  // 그래서 nudge 적용 후에 합친다.
  const promptWithHistory = historyContext
    ? `[참고: 이 채널의 최근 메시지 — 'navis' 는 너 자신의 직전 발화/자동 보고. 새 세션이라 맥락 보강용으로 붙여둠. 사용자의 이번 질문은 아래 "[현재 메시지]" 블록.]\n${historyContext}\n\n[현재 메시지]\n${nudgedPrompt}`
    : nudgedPrompt;

  // 이미지가 있으면 content block 배열로 구성해 user 메시지 하나를 yield 한다.
  // 없으면 기존처럼 문자열 prompt 그대로(가장 단순한 경로).
  const promptInput =
    images.length > 0
      ? buildImageMessage(promptWithHistory, images)
      : promptWithHistory;

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
        // 중지 버튼 → 서버 생성도 실제로 끊기게 컨트롤러 연결(토큰 낭비 방지).
        ...(abortController ? { abortController } : {}),
        systemPrompt: systemPromptFinal,
        // namory(항상 로드) + 동적 커넥터 + 내장 in-process 서버 — 공유 빌더.
        mcpServers: buildChatMcpServers(connectors),
        // 자동 승인 도구 — 공유 빌더(./allowed-tools.ts 가 단일 출처).
        allowedTools: buildChatAllowedTools(connectors, allowProfileUpdate),
        // 로컬 설정(CLAUDE.md, settings.json) 무시.
        settingSources: [],
        // 도구 호출 루프 여유.
        maxTurns: 16,
        // 스트리밍 콜백이 있으면 부분 메시지(text_delta)를 받기 위해 켠다.
        ...(onTextDelta ? { includePartialMessages: true } : {}),
        // 이전 대화 이어받기 (있을 때만).
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
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

// 도구 이름 + 인풋에서 사람이 읽기 좋은 진행 상태 문자열 생성.
// content_block_start(이름만) 이후 assistant 메시지(전체 input)에서 한 번 더 업데이트할 때 씀.
function richToolStatus(name: string, input: Record<string, unknown> = {}): string {
  const short = (v: unknown, max = 20) => {
    const s = String(v ?? "").trim();
    return s.length > max ? s.slice(0, max) + "…" : s;
  };

  if (name === "mcp__namory__recall" || name === "mcp__namory__search") {
    const q = input.query ?? input.q ?? "";
    return q ? `기억 검색: ${short(q)}` : "기억을 찾는 중";
  }
  if (name === "mcp__namory__save") return "기억을 저장하는 중";
  if (name === "mcp__namory__recent") return "최근 기억 확인 중";
  if (name === "mcp__namory__todos") return "할 일 목록 확인 중";
  if (name === "mcp__namory__update") return "기억 수정 중";
  if (name === "mcp__namory__delete") return "기억 삭제 중";

  if (name.startsWith("mcp__google__list")) {
    const start = input.start_date ?? input.timeMin ?? "";
    return start ? `캘린더 확인: ${short(start, 10)}` : "캘린더 확인 중";
  }
  if (name === "mcp__google__create_event") {
    const title = input.summary ?? input.title ?? "";
    return title ? `일정 추가: ${short(title)}` : "일정 추가 중";
  }
  if (name.startsWith("mcp__google__")) return "캘린더 작업 중";

  if (name === "mcp__repo__read_repo_file") {
    const p = input.path ?? input.file_path ?? "";
    return p ? `코드 읽기: ${short(p)}` : "코드 확인 중";
  }
  if (name === "mcp__repo__list_repo_files") return "파일 목록 확인 중";
  if (name.startsWith("mcp__self_modify__")) return "코드 개선 요청 중";
  if (name.startsWith("mcp__cron__")) return "예약 작업 설정 중";

  if (name === "Read") {
    const p = input.file_path ?? "";
    return p ? `파일 읽기: ${short(String(p).split("/").pop() ?? p)}` : "파일 읽는 중";
  }
  if (name === "Write" || name === "Edit") {
    const p = input.file_path ?? "";
    return p ? `파일 수정: ${short(String(p).split("/").pop() ?? p)}` : "파일 수정 중";
  }
  if (name === "Bash") {
    const cmd = input.command ?? "";
    return cmd ? `실행: ${short(cmd)}` : "명령 실행 중";
  }
  if (name === "WebSearch") {
    const q = input.query ?? "";
    return q ? `검색: ${short(q)}` : "검색 중";
  }
  if (name === "WebFetch") {
    const url = String(input.url ?? "").replace(/^https?:\/\//, "");
    return url ? `페이지 읽기: ${short(url)}` : "페이지 읽는 중";
  }

  return "작업하는 중";
}
