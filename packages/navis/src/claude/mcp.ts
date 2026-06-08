// Claude Agent SDK에 붙이는 외부 MCP 서버 설정 빌더.
// 도구 화이트리스트는 ./allowed-tools.ts 참조.

// navis가 붙이는 외부 HTTP MCP 서버 설정 형태. 토큰은 Authorization 헤더로 전달.
export interface McpHttpServer {
  type: "http";
  url: string;
  headers: { Authorization: string };
  alwaysLoad: true;
}

// {url, token} 한 쌍을 HTTP MCP 서버 설정으로 변환. namory 연결과 동일한 패턴.
export function httpMcp(conn: { url: string; token: string }): McpHttpServer {
  return {
    type: "http",
    url: conn.url,
    headers: { Authorization: `Bearer ${conn.token}` },
    alwaysLoad: true,
  };
}
