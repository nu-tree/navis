// Claude Agent SDK 에 붙이는 MCP 서버 설정 빌더.
// 도구 화이트리스트는 ./allowed-tools.ts 참조.

import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { MEMORY_TOOLS } from "namory";

// navis 가 붙이는 외부 HTTP MCP 서버 설정 형태. 토큰은 Authorization 헤더로 전달.
// (동적 커넥터 — DB 에 등록된 제3자 MCP 서버들이 이 형태를 쓴다.)
export interface McpHttpServer {
  type: "http";
  url: string;
  headers: { Authorization: string };
  alwaysLoad: true;
}

// {url, token} 한 쌍을 HTTP MCP 서버 설정으로 변환.
export function httpMcp(conn: { url: string; token: string }): McpHttpServer {
  return {
    type: "http",
    url: conn.url,
    headers: { Authorization: `Bearer ${conn.token}` },
    alwaysLoad: true,
  };
}

// ── namory MCP — in-process ──────────────────────────────────────────────────
// 예전에는 namory 가 별도 서비스라 HTTP MCP(type:"http", NAMORY_MCP_URL)로 붙였다.
// 한 배포 단위로 합친 뒤로는 같은 프로세스 안에 있으므로 in-process SDK MCP 서버로
// 붙인다. recall/save 같은 도구 호출이 한 턴에 여러 번 나가는데, 그게 전부 자기
// 자신에게 보내는 HTTP 왕복이 되는 걸 없앤다(서버리스에서는 그 왕복이 두 번째
// 함수 인스턴스의 콜드스타트까지 끌고 온다).
//
// 도구 정의(이름·설명·스키마)는 namory 의 MEMORY_TOOLS 레지스트리가 단일 출처다 —
// 공개 /mcp 라우트(Claude 커스텀 커넥터)도 같은 레지스트리를 쓰므로 둘이 어긋나지 않는다.
//
// 도구 이름은 mcp__namory__<name> 으로 노출된다(allowed-tools.ts 의 화이트리스트와 일치).
export function namoryMcp(): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "namory",
    version: "0.2.0",
    tools: MEMORY_TOOLS.map((t) =>
      tool(t.name, t.description, t.inputSchema, async (args) => {
        // namory 는 raw 데이터만 돌려준다("멍청한" 저장소) — 해석은 모델이 한다.
        const data = await t.handler(args as Record<string, never>);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      }),
    ),
  });
}
