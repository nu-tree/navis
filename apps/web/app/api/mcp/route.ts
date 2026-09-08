import { buildMcpServer } from "namory/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── namory MCP 엔드포인트 (외부 MCP 클라이언트용) ────────────────────────────
// Claude 커스텀 커넥터·mcp-remote 등이 여기에 붙어 기억 도구를 쓴다.
//
// navis 에이전트는 이 경로를 쓰지 않는다 — 같은 배포 안의 라이브러리라 in-process
// SDK MCP 로 직접 붙는다(packages/navis/src/claude/mcp.ts). 도구 정의는 양쪽이
// namory 의 MEMORY_TOOLS 레지스트리를 공유하므로 어긋나지 않는다.
//
// stateless 모드(sessionIdGenerator 미지정): 요청마다 새 서버+트랜스포트를 만든다.
// 서버리스에서는 이게 유일하게 옳은 선택이다 — 세션 상태를 인스턴스 메모리에 들고
// 있어도 다음 요청은 다른 인스턴스로 가므로 세션 친화성이 성립하지 않는다.
//
// 인증: NAMORY_TOKEN. Claude 커스텀 커넥터 UI 에는 헤더 입력란이 없어 URL 쿼리
// (?token=)도 받는다. 쿼리 토큰이 로그에 남을 수 있다는 점은 감수하는 트레이드오프다.

function unauthorized(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "unauthorized" }, id: null },
    { status: 401 },
  );
}

function authorize(req: Request): boolean {
  const expected = process.env.NAMORY_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = new URL(req.url).searchParams.get("token") ?? undefined;
  const token = header || query;
  return !!token && token === expected;
}

async function handle(req: Request): Promise<Response> {
  if (!authorize(req)) return unauthorized();

  const server = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    // stateless — 세션 관리 비활성.
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (err) {
    console.error("[mcp] 요청 처리 실패:", err);
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
