import type { McpHttpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { listConnectors } from "./store.js";
import { refreshIfNeeded } from "./oauth.js";
import type { Connector } from "./types.js";

// 활성 커넥터들을 Claude Agent SDK 의 mcpServers + allowedTools 로 변환한다.
// ask.ts 가 query() 호출 직전에 한 번 불러 기존 내장 서버 설정에 합친다.

export interface BuiltConnectors {
  // { [id]: httpServerConfig } — query({ options: { mcpServers } }) 에 스프레드.
  servers: Record<string, McpHttpServerConfig>;
  // allowedTools 에 합칠 항목. "mcp__<id>" 한 줄이 그 서버의 모든 도구를 자동 승인한다
  // (도구 이름을 미리 모르는 동적 커넥터라 와일드카드 형태가 필수).
  allowedTools: string[];
}

// 인증 타입 → HTTP 헤더. none 이면 빈 객체.
function authHeaders(auth: Connector["auth"]): Record<string, string> {
  switch (auth.type) {
    case "none":
      return {};
    case "apikey":
      return { [auth.header ?? "Authorization"]: auth.value };
    case "oauth":
      return { Authorization: `Bearer ${auth.token}` };
  }
}

// 커넥터 1개 → SDK http 서버 설정.
export function connectorToServer(c: Connector): McpHttpServerConfig {
  const headers = authHeaders(c.auth);
  return {
    type: "http",
    url: c.url,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    alwaysLoad: c.alwaysLoad,
  };
}

// DB 에서 활성 커넥터를 읽어 SDK 설정으로 빌드. 조회 실패 시 빈 결과(연동 없이 안전 동작).
// oauth 커넥터는 사용 직전 만료 임박이면 토큰을 선제 갱신(refreshIfNeeded)한다.
export async function buildEnabledConnectors(): Promise<BuiltConnectors> {
  const list = (await listConnectors()).filter((c) => c.enabled);
  // 만료 임박 토큰은 갱신(병렬). oauth 외/여유 있으면 즉시 원본 반환이라 비용 거의 없음.
  const refreshed = await Promise.all(list.map((c) => refreshIfNeeded(c)));
  const servers: Record<string, McpHttpServerConfig> = {};
  const allowedTools: string[] = [];
  for (const c of refreshed) {
    servers[c.id] = connectorToServer(c);
    allowedTools.push(`mcp__${c.id}`);
  }
  return { servers, allowedTools };
}
