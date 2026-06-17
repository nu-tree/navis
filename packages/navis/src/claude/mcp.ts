// Claude Agent SDK에 붙이는 외부 MCP 서버 설정 빌더.
// 도구 화이트리스트는 ./allowed-tools.ts 참조.

import { config } from "../config.js";

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

// namory MCP 서버 설정 — config 에서 url/token 을 읽어 httpMcp 호출.
// 메인 턴(ask.ts)과 큐레이터(curator.ts) 양쪽이 같은 설정을 쓰도록 단일 출처로 통일.
export function namoryMcp(): McpHttpServer {
  return httpMcp({ url: config.namoryMcpUrl, token: config.namoryToken });
}
