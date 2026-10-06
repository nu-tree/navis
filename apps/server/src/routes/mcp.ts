import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { memory } from "@navis/domain";

// 외부 MCP — Claude Code 가 navis 의 기억을 읽고 쓰는 통로(헌장 보안 절).
//
// navis 대화와 **같은 도구 정의**를 쓴다. createMemoryMcpServer 가 돌려주는 instance 가
// MCP SDK 의 McpServer 라서 HTTP 전송에 그대로 붙일 수 있다 — 설명이 두 벌로 갈라지지 않는다.
//
// ★ 무상태(stateless)로 둔다. 요청마다 서버 · 전송을 새로 만들고 세션 ID 를 발급하지 않는다.
//   save · recall 은 요청 하나로 끝나서 세션이 줄 것이 없고, 세션을 두면 인스턴스가
//   다시 뜰 때(Cloud Run 이 0 으로 내려갔다 올라올 때) 클라이언트가 죽은 세션을 들고 온다.
export const mcpRoute = new Hono().all("/", async (c) => {
  // 집계는 대화 턴의 done.saved 용이다. 여기서는 쓰지 않는다.
  const { instance } = memory.createMemoryMcpServer({ saved: 0 });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // SSE 대신 JSON 한 번으로 답한다. 도구가 진행 상황을 흘려보낼 일이 없다.
    enableJsonResponse: true,
  });
  await instance.connect(transport);
  try {
    // JSON 응답 모드라 응답이 다 만들어진 뒤에 돌아온다 — 그 다음에 닫아도 안전하다.
    return await transport.handleRequest(c.req.raw);
  } finally {
    await instance.close();
  }
});
