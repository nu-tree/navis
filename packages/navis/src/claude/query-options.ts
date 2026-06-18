import type { McpServerConfig, Options } from "@anthropic-ai/claude-agent-sdk";
import { buildCronTools, CRON_TOOL_NAMES } from "../cron/mcp.js";
import { buildRepoTools, REPO_TOOL_NAMES } from "../repo/mcp.js";
import { buildSelfModifyTools, SELF_MODIFY_TOOL_NAMES } from "../self-modify/mcp.js";
import { buildSettingsTools, SETTINGS_TOOL_NAMES } from "../settings/mcp.js";
import { type BuiltConnectors } from "../connectors/mcp.js";
import { namoryMcp } from "./mcp.js";
import { buildGoogleTools, GOOGLE_TOOL_NAMES } from "../google/mcp.js";
import { isCalendarEnabled } from "../google/auth.js";
import {
  BUILTIN_TOOLS,
  NAMORY_PROFILE_UPDATE_TOOL,
  NAMORY_TOOLS,
} from "./allowed-tools.js";

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
    // namory MCP — 공유 헬퍼(namoryMcp)로 alwaysLoad+Bearer 헤더를 단일 출처에서 만든다.
    namory: namoryMcp(),
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

// 콜드(askClaude) / 워밍(warm.ts createSession) 공유 query options 빌더.
// SDK 옵션 객체를 양쪽이 거의 동일하게 구성하던 중복을 제거한다 — maxTurns 같은
// 한 값만 바뀌어도 두 경로가 어긋나면 채팅 동작이 달라지는 위험(파일 상단 주석이
// 명시적으로 막으려던 위험)을 단일 출처로 보장. model·thinking·effort 처럼 경로별로
// 다른 옵션은 호출부에서 spread 로 덧붙인다.
export function buildChatQueryOptions(
  connectors: BuiltConnectors,
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
    mcpServers: buildChatMcpServers(connectors),
    allowedTools: buildChatAllowedTools(connectors, opts.allowProfileUpdate),
    // 로컬 설정(CLAUDE.md, settings.json) 무시.
    settingSources: [],
    // 도구 호출 루프 여유.
    maxTurns: 16,
    ...(opts.includePartial ? { includePartialMessages: true } : {}),
    ...(opts.abortController ? { abortController: opts.abortController } : {}),
    ...(opts.resume ? { resume: opts.resume } : {}),
  };
}
