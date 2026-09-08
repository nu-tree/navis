import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

// askClaude 에 주입하는 "채팅 환경" — 무엇을 주입하느냐로 도구 범위가 결정된다.
// 두뇌(askClaude/query-options)는 cron·google 같은 구체 도구를 모르고, 호출부가
// 각자 env 를 넘긴다.
//   - 서버(앱/크론/다이제스트): fullChatEnv → server-env.ts (cron·google·settings·동적 커넥터)
export interface ConnectorBundle {
  servers: Record<string, McpServerConfig>;
  allowedTools: string[];
}

// prefetch 결과: [동적 커넥터, 기본 시스템프롬프트, 프로젝트 가이던스].
export type ChatPrefetchResult = [ConnectorBundle, string, string];

export interface ChatEnv {
  // 추가로 붙일 in-process MCP 서버들(cron/google/...). CLI 는 {}.
  mcpServers: Record<string, McpServerConfig>;
  // 위 서버들의 자동승인 도구 이름. CLI 는 [].
  allowedToolNames: string[];
  // 동적 커넥터 + 시스템프롬프트 + 가이던스를 가져온다(서버는 캐시 prefetch, CLI 는 경량).
  prefetch: () => Promise<ChatPrefetchResult>;
}
