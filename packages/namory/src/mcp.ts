// MCP SDK 어댑터 — 도구 레지스트리(tools/registry.ts)를 McpServer 로 감싼다.
// 공개 /mcp 라우트(Claude 커스텀 커넥터·mcp-remote 클라이언트)가 쓰는 경로다.
// navis 에이전트는 이 서버를 HTTP 로 호출하지 않고, 같은 레지스트리를 Agent SDK 의
// in-process MCP 로 직접 붙인다 — 도구 정의는 한 곳(레지스트리)에만 있다.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MEMORY_TOOLS } from "./tools/registry.js";

// 서버는 "멍청하게": raw 데이터를 JSON 텍스트로만 돌려준다.
// 패턴 해석·요약·프로파일 작성 등 지능은 클라이언트(Claude)가 수행 → 서버 LLM 호출 0.
const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "namory", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  for (const t of MEMORY_TOOLS) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
      },
      async (args: unknown) => ok(await t.handler(args as Record<string, never>)),
    );
  }

  return server;
}
