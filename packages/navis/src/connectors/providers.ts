import { config } from "../config.js";

// OAuth 커넥터 제공자 프리셋 — "잘 알려진 MCP 서버" 목록.
//
// 두 가지 OAuth 방식을 하이브리드로 지원한다(연결 시점에 자동 선택):
//   - DCR 지원 서버(예: Notion) → client_id 를 런타임 자동 발급. 사전 설정 0.
//   - DCR 미지원 서버(예: Google) → 미리 등록된 client_id/secret 필요. 구글은 DCR 을
//     안 하므로(=Claude Desktop 도 Anthropic 이 등록해둔 클라이언트를 씀), navis 도 자기
//     client_id 가 있어야 한다. 구글 캘린더는 기존 캘린더용 자격(config.google)을 재활용.
//
// 새 DCR 제공자: {key,label,mcpUrl} 한 줄. classic 제공자: scopes + 자격 소스 추가.

export interface McpProvider {
  key: string; // 커넥터 id (슬러그)
  label: string;
  mcpUrl: string; // HTTP MCP 서버 URL
  // classic OAuth(DCR 미지원 서버)용. scopes 가 있으면 classic 으로 간주 → client 자격 필요.
  scopes?: string[];
  // authorize 단계 추가 쿼리(구글: refresh_token 확보용 access_type=offline + prompt=consent).
  extraAuthParams?: Record<string, string>;
  // 런타임 주입 — 등록된 client 자격(classic 일 때만).
  clientId?: string;
  clientSecret?: string;
}

type Preset = Omit<McpProvider, "clientId" | "clientSecret">;

const PRESETS: Preset[] = [
  // DCR — 무설정.
  { key: "notion", label: "Notion", mcpUrl: "https://mcp.notion.com/mcp" },
  // classic — 구글은 DCR 미지원이라 등록된 client 필요. 기존 캘린더 자격(config.google) 재활용.
  // scope 는 읽기+쓰기 풀 캘린더. access_type=offline+prompt=consent 로 refresh_token 확보.
  {
    key: "google_calendar",
    label: "Google Calendar",
    mcpUrl: "https://calendarmcp.googleapis.com/mcp/v1",
    scopes: ["https://www.googleapis.com/auth/calendar"],
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
];

// 제공자별 등록된 client 자격 주입. 구글 캘린더는 기존 캘린더 OAuth 자격을 그대로 쓴다.
function credsFor(key: string): { clientId?: string; clientSecret?: string } {
  if (key === "google_calendar" && config.google) {
    return { clientId: config.google.clientId, clientSecret: config.google.clientSecret };
  }
  return {};
}

// 앱 "연결" 버튼 활성 여부. classic(scope 지정) → client 자격이 있어야 가능. DCR → 항상 가능.
export function isProviderAvailable(p: McpProvider): boolean {
  if (p.scopes && p.scopes.length) return Boolean(p.clientId);
  return true;
}

export function getProvider(key: string): McpProvider | undefined {
  const preset = PRESETS.find((p) => p.key === key);
  if (!preset) return undefined;
  return { ...preset, ...credsFor(preset.key) };
}

export function listProviders(): McpProvider[] {
  return PRESETS.map((p) => ({ ...p, ...credsFor(p.key) }));
}
