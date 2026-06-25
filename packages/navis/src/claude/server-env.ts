// 서버(앱 채팅·크론·다이제스트) 전체 도구셋 환경. 무거운 in-process MCP 서버
// (cron→node-cron, google→googleapis)와 동적 커넥터 prefetch 를 한 곳에 모은다.
// askClaude 에 env 로 주입된다 — 두뇌(query-options)는 이 파일을 모른다.
//
// in-process MCP 서버 빌더들은 상태가 변하지 않아 모듈 로드 시 한 번만 만든다(첫 토큰
// 지연 절감 — 이전엔 매 askClaude 호출마다 5개 서버를 재구성).
import { buildCronTools, CRON_TOOL_NAMES } from "../cron/mcp.js";
import { buildRepoTools, REPO_TOOL_NAMES } from "../repo/mcp.js";
import { buildSelfModifyTools, SELF_MODIFY_TOOL_NAMES } from "../self-modify/mcp.js";
import { buildSettingsTools, SETTINGS_TOOL_NAMES } from "../settings/mcp.js";
import { buildGoogleTools, GOOGLE_TOOL_NAMES } from "../google/mcp.js";
import { isCalendarEnabled } from "../google/auth.js";
import { getChatPrefetch } from "./prefetch.js";
import type { ChatEnv } from "./chat-env.js";

const cronServer = buildCronTools();
const repoServer = buildRepoTools();
const selfModifyServer = buildSelfModifyTools();
const settingsServer = buildSettingsTools();
// 구글은 env(client/secret/refresh) 셋이 모두 채워졌을 때만 활성 — 프로세스 수명 동안
// 안 바뀌므로 모듈 로드 시점에 한 번만 판정.
const googleServer = isCalendarEnabled() ? buildGoogleTools() : undefined;

export const fullChatEnv: ChatEnv = {
  mcpServers: {
    cron: cronServer,
    repo: repoServer,
    self_modify: selfModifyServer,
    settings: settingsServer,
    ...(googleServer ? { google: googleServer } : {}),
  },
  allowedToolNames: [
    ...CRON_TOOL_NAMES,
    ...REPO_TOOL_NAMES,
    ...SELF_MODIFY_TOOL_NAMES,
    ...SETTINGS_TOOL_NAMES,
    ...(googleServer ? GOOGLE_TOOL_NAMES : []),
  ],
  prefetch: getChatPrefetch,
};
