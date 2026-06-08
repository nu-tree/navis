// OAuth 커넥터 제공자 프리셋 — "잘 알려진 MCP 서버" 목록.
//
// 연결 방식은 연결 시점에 자동 선택(하이브리드):
//   - DCR 지원 서버(예: Notion) → client_id 런타임 자동 발급. 사전 설정 0.
//   - DCR 미지원 + 등록된 client 자격 있는 classic 서버 → 그 자격 사용(scopes 지정 필요).
//
// 참고: Google Calendar hosted MCP(calendarmcp.googleapis.com)는 한때 classic 프리셋으로
// 넣었으나, 그 API 가 "Google Workspace Developer Preview Program" 등록 프로젝트에만 열리는
// 프리뷰 기능이라(미등록 시 "The caller does not have permission") 일반 사용 불가 → 제거함.
// navis 의 캘린더는 in-process 코드(google/*)가 read+write 로 처리. 구글이 프리뷰를 일반
// 공개하면 { key, label, mcpUrl, scopes:[".../auth/calendar"] } 한 줄로 다시 추가 가능.

export interface McpProvider {
  key: string; // 커넥터 id (슬러그)
  label: string;
  mcpUrl: string; // HTTP MCP 서버 URL
  // classic OAuth(DCR 미지원 서버)용. scopes 가 있으면 classic 으로 간주 → client 자격 필요.
  scopes?: string[];
  // authorize 단계 추가 쿼리(예: 구글 refresh_token 확보용 access_type=offline).
  extraAuthParams?: Record<string, string>;
  // 런타임 주입 — 등록된 client 자격(classic 일 때만).
  clientId?: string;
  clientSecret?: string;
}

const PRESETS: McpProvider[] = [
  // DCR — 무설정.
  { key: "notion", label: "Notion", mcpUrl: "https://mcp.notion.com/mcp" },
];

// 앱 "연결" 버튼 활성 여부. classic(scope 지정) → client 자격이 있어야 가능. DCR → 항상 가능.
export function isProviderAvailable(p: McpProvider): boolean {
  if (p.scopes && p.scopes.length) return Boolean(p.clientId);
  return true;
}

export function getProvider(key: string): McpProvider | undefined {
  return PRESETS.find((p) => p.key === key);
}

export function listProviders(): McpProvider[] {
  return PRESETS;
}
