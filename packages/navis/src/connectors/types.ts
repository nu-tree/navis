// 동적 MCP 커넥터 데이터 모델.
//
// claude.ai 스타일: 코어는 "HTTP MCP 서버 URL + 인증" 을 DB(namory settings)에서 읽어
// 매 query() 호출 시 mcpServers 에 주입할 뿐, 서비스별 코드는 두지 않는다. 새 서비스는
// 코드 수정 없이 커넥터 레코드 등록만으로 붙고, enabled=false 나 삭제로 빠진다.
//
// 인증 타입 3종 (메모리 결정: none/apikey/oauth):
//   - none   : 헤더 없음(공개 MCP).
//   - apikey : 임의 헤더에 값 그대로. 기본 헤더는 Authorization, 값은 "Bearer xxx" 등 원문.
//   - oauth  : Authorization: Bearer <token>. refresh* 필드는 미래 자동 갱신용 보관(코어는 현재
//              access token 만 사용 — 헤드리스 자동 갱신은 후속 작업).

export type ConnectorAuth =
  | { type: "none" }
  | {
      // 임의 헤더에 정적 키를 실어 보낸다. header 미지정 시 Authorization.
      type: "apikey";
      header?: string;
      value: string;
    }
  | {
      // OAuth access token 을 Bearer 로 전달. 나머지는 만료 시 자동 갱신용 메타데이터로,
      // 갱신이 코어 안에서 자기완결적으로 돌도록 토큰 엔드포인트·자격·인증방식을 함께 보관.
      type: "oauth";
      token: string;
      refreshToken?: string;
      tokenUrl?: string;
      clientId?: string;
      clientSecret?: string;
      // 토큰 엔드포인트에 자격을 싣는 방식. basic=Authorization: Basic, body=요청 본문.
      clientAuth?: "basic" | "body";
      // 토큰 엔드포인트 본문 형식. form=x-www-form-urlencoded, json=application/json.
      bodyFormat?: "form" | "json";
      // epoch ms. access token 만료 시각 — 임박하면 refresh 로 선제 갱신.
      expiresAt?: number;
    };

export interface Connector {
  // MCP 서버 이름이자 도구 네임스페이스. 도구는 mcp__<id>__* 로 노출된다.
  // [a-z0-9_] 만 허용(슬러그). 예: "notion", "linear".
  id: string;
  // 앱 UI 표시용 이름. 예: "Notion".
  label: string;
  // HTTP MCP 서버 엔드포인트(예: https://mcp.notion.com/mcp).
  url: string;
  auth: ConnectorAuth;
  // false 면 query() 에 주입하지 않는다(등록은 유지, 일시 비활성).
  enabled: boolean;
  // true 면 매 턴 프롬프트에 도구를 항상 싣는다(namory 처럼). false 면 tool-search
  // 뒤로 deferred — 커넥터가 많아질 때 첫 턴 비용·컨텍스트를 아낀다. 기본 true(확실히 동작).
  alwaysLoad: boolean;
}
