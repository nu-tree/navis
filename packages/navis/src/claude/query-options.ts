import type { McpServerConfig, Options } from "@anthropic-ai/claude-agent-sdk";
import { namoryMcp } from "./mcp.js";
import {
  BUILTIN_TOOLS,
  NAMORY_PROFILE_UPDATE_TOOL,
  NAMORY_TOOLS,
} from "./allowed-tools.js";
import type { ChatEnv, ConnectorBundle } from "./chat-env.js";

// ── 채팅 query 설정 빌더 (콜드 askClaude · 워밍 세션이 공유) ──────────────────────
// in-process MCP 서버(cron/google/...)는 여기서 모르고, 호출부가 넘기는 env 로 주입된다
// (server-env.ts). namory MCP 와 내장 도구만 이 파일의 공통 베이스.
// mcpServers/allowedTools/systemPrompt 는 보안·동작에 직결되므로 한 곳에서 만들어
// 두 경로(매 메시지 askClaude, 지속 워밍 세션 warm.ts)가 절대 어긋나지 않게 한다.

// 시스템 프롬프트: 기본 + (프로젝트 컨텍스트) + 프로젝트 표기 가이던스.
export function buildChatSystemPrompt(
  baseSystemPrompt: string,
  guidance: string,
  projectContext?: string,
): string {
  const s = projectContext
    ? `${baseSystemPrompt}\n\n[운영 컨텍스트] 현재 작업 프로젝트: "${projectContext}". 이 대화에서 mcp__namory__save 를 호출할 때 모든 항목에 project: "${projectContext}" 를 명시할 것.`
    : baseSystemPrompt;
  return s + guidance;
}

// MCP 서버 묶음: 동적 커넥터(있으면) + namory(항상 로드) + env 가 주입한 in-process 서버들.
export function buildChatMcpServers(
  env: ChatEnv,
  connectors: ConnectorBundle,
): Record<string, McpServerConfig> {
  return {
    // DB 등록 커넥터들(있을 때만)을 먼저 펼친다 — 내장 서버 키(namory/cron/...)가
    // 항상 이기도록(같은 id 면 아래 내장 정의가 덮음). 등록 단계에서도 예약어를 거부한다.
    ...connectors.servers,
    // namory MCP — 공유 헬퍼(namoryMcp)로 alwaysLoad+Bearer 헤더를 단일 출처에서 만든다.
    namory: namoryMcp(),
    // 호출부(server-env)가 주입한 추가 서버(cron/google/...).
    ...env.mcpServers,
  };
}

// 자동 승인 도구 목록. profile_update는 신뢰된 다이제스트 경로에서만 추가.
export function buildChatAllowedTools(
  env: ChatEnv,
  connectors: ConnectorBundle,
  allowProfileUpdate: boolean,
): string[] {
  return [
    ...NAMORY_TOOLS,
    ...(allowProfileUpdate ? [NAMORY_PROFILE_UPDATE_TOOL] : []),
    // env 가 주입한 추가 도구(cron/google/...).
    ...env.allowedToolNames,
    // 동적 커넥터: "mcp__<id>" 와일드카드로 각 커넥터의 모든 도구를 자동 승인.
    ...connectors.allowedTools,
    ...BUILTIN_TOOLS,
  ];
}

// 콜드(askClaude) / 워밍(warm.ts createSession) 공유 query options 빌더.
// SDK 옵션 객체를 양쪽이 거의 동일하게 구성하던 중복을 제거한다 — maxTurns 같은
// 한 값만 바뀌어도 두 경로가 어긋나면 채팅 동작이 달라지는 위험(파일 상단 주석이
// 명시적으로 막으려던 위험)을 단일 출처로 보장. model·thinking·effort 처럼 경로별로
// 다른 옵션은 호출부에서 spread 로 덧붙인다.
export function buildChatQueryOptions(
  env: ChatEnv,
  connectors: ConnectorBundle,
  systemPrompt: string,
  opts: {
    resume?: string;
    abortController?: AbortController;
    allowProfileUpdate: boolean;
    includePartial: boolean;
  },
): Options {
  return {
    systemPrompt,
    mcpServers: buildChatMcpServers(env, connectors),
    allowedTools: buildChatAllowedTools(env, connectors, opts.allowProfileUpdate),
    // 로컬 설정(CLAUDE.md, settings.json) 무시.
    settingSources: [],
    // 도구 호출 루프 여유.
    maxTurns: 16,
    ...(opts.includePartial ? { includePartialMessages: true } : {}),
    ...(opts.abortController ? { abortController: opts.abortController } : {}),
    ...(opts.resume ? { resume: opts.resume } : {}),
  };
}
