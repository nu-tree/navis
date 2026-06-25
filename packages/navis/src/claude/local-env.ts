// navis CLI(로컬 실행) 도구셋 환경 — namory(기억) + 내장 파일/Bash 도구만.
// cron·google·repo·self_modify·settings·동적 커넥터를 모두 제외해, CLI 가 무거운
// 서버 의존성(googleapis/node-cron)을 끌어오지 않게 한다. namory MCP 와 내장 도구
// (Read/Edit/Write/Bash/Glob/Grep)는 query-options 의 공통 베이스에서 항상 붙는다.
import { getSystemPrompt } from "../system-prompt.js";
import { projectGuidance } from "../projects.js";
import type { ChatEnv, ChatPrefetchResult } from "./chat-env.js";

// 동적 커넥터 없이 시스템프롬프트 + 가이던스만 가져온다(서버 핫패스 캐시는 불필요).
async function localPrefetch(): Promise<ChatPrefetchResult> {
  const [systemPrompt, guidance] = await Promise.all([
    getSystemPrompt(),
    projectGuidance(),
  ]);
  return [{ servers: {}, allowedTools: [] }, systemPrompt, guidance];
}

export const localChatEnv: ChatEnv = {
  mcpServers: {},
  allowedToolNames: [],
  prefetch: localPrefetch,
};
