// OAuth 커넥터 제공자 프리셋 — "잘 알려진 MCP 서버" 목록일 뿐.
//
// MCP-스펙 OAuth(메타데이터 발견 + Dynamic Client Registration)를 쓰므로 제공자별
// 엔드포인트/스코프/클라이언트 자격을 여기 둘 필요가 없다. 필요한 건 MCP 서버 URL 하나.
// 인증 좌표(authorize/token/registration)는 연결 시점에 서버에서 자동 발견하고,
// client_id 는 DCR 로 런타임에 자동 발급받는다(=Claude Desktop 이 사람 등록 없이 되는 원리).
//
// 새 제공자 추가 = 여기에 {key,label,mcpUrl} 한 줄. 사용자가 직접 URL 을 넣어 연결할 수도 있다.

export interface McpProvider {
  key: string; // 커넥터 id (슬러그)
  label: string;
  mcpUrl: string; // HTTP MCP 서버 URL
}

const PRESETS: McpProvider[] = [
  { key: "notion", label: "Notion", mcpUrl: "https://mcp.notion.com/mcp" },
];

export function listProviders(): McpProvider[] {
  return PRESETS;
}

export function getProvider(key: string): McpProvider | undefined {
  return PRESETS.find((p) => p.key === key);
}
