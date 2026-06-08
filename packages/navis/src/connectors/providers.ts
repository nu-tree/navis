// OAuth 커넥터 제공자 프리셋. 호출 로직은 oauth.ts, HTTP 는 http/connectors.ts.
//
// 여기 있는 건 "설정 데이터"(엔드포인트·스코프·MCP URL)뿐 — 제공자별 호출 코드는 없다.
// 새 제공자는 이 배열에 한 줄 추가 + 환경변수로 OAuth client 자격만 주면 된다.
// client_id/secret 은 코드에 박지 않고 <KEY>_OAUTH_CLIENT_ID / _SECRET 환경변수에서 읽는다.
//
// ⚠️ 제공자 엔드포인트는 변할 수 있다. notion 프리셋은 클래식 공개 OAuth 기준이라,
// hosted MCP(mcp.notion.com)가 MCP-스펙 OAuth(PKCE+DCR)를 요구하면 조정이 필요할 수 있다.
// 그 경우 custom 경로(직접 authorizeUrl/tokenUrl 지정)로 우회 가능.

export interface OAuthProvider {
  key: string; // 커넥터 id 이자 제공자 식별자(슬러그)
  label: string;
  // 연결 성공 시 커넥터가 가리킬 HTTP MCP 서버 URL.
  mcpUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  usePkce: boolean;
  // 토큰 엔드포인트 자격 전달 방식·본문 형식(refresh 까지 동일 적용).
  clientAuth: "basic" | "body";
  bodyFormat: "form" | "json";
  // authorize 단계에 덧붙일 추가 쿼리(예: 구글 refresh_token 강제 access_type=offline).
  extraAuthParams?: Record<string, string>;
  // 런타임 주입 — 환경변수에서 채움.
  clientId?: string;
  clientSecret?: string;
}

type Preset = Omit<OAuthProvider, "clientId" | "clientSecret">;

const PRESETS: Preset[] = [
  {
    key: "notion",
    label: "Notion",
    mcpUrl: "https://mcp.notion.com/mcp",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    usePkce: true,
    clientAuth: "basic",
    bodyFormat: "json",
    extraAuthParams: { owner: "user" },
  },
];

function credsFor(key: string): { clientId?: string; clientSecret?: string } {
  const up = key.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return {
    clientId: process.env[`${up}_OAUTH_CLIENT_ID`] || undefined,
    clientSecret: process.env[`${up}_OAUTH_CLIENT_SECRET`] || undefined,
  };
}

// client_id 가 환경변수에 있으면 "사용 가능". secret 은 PKCE 공개 클라이언트면 없을 수도 있다.
export function isProviderAvailable(p: OAuthProvider): boolean {
  return Boolean(p.clientId);
}

// 프리셋 한 개를 자격까지 채워 반환.
export function getProvider(key: string): OAuthProvider | undefined {
  const preset = PRESETS.find((p) => p.key === key);
  if (!preset) return undefined;
  return { ...preset, ...credsFor(preset.key) };
}

// 전체 프리셋(자격 주입됨).
export function listProviders(): OAuthProvider[] {
  return PRESETS.map((p) => ({ ...p, ...credsFor(p.key) }));
}
