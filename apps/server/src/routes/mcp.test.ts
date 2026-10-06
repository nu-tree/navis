// 외부 MCP 계약. 지키는 것:
//   1) /mcp 는 NAVIS_MCP_TOKEN 으로만 열린다 — API_TOKEN 으로는 401
//   2) MCP 토큰으로 다른 라우트를 부를 수 없다 — 두 자격이 서로의 범위로 새지 않는다
//   3) 노출하는 도구는 navis 대화와 같은 save · recall 이다
//
// domain 은 실물을 쓴다. tools/list 는 DB 를 건드리지 않는다(db 클라이언트는 첫 질의에서 연결).
import { beforeAll, describe, expect, it, vi } from "vitest";

const API_TOKEN = "test-api-token";
const MCP_TOKEN = "test-mcp-token";
vi.stubEnv("API_TOKEN", API_TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_MCP_TOKEN", MCP_TOKEN);

let app: { fetch: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  ({ app } = await import("../app"));
});

const rpc = (body: unknown, token?: string) =>
  app.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Streamable HTTP 는 두 형식을 모두 받겠다고 밝혀야 한다(스펙).
        accept: "application/json, text/event-stream",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

describe("/mcp 인증", () => {
  it("토큰 없이 401", async () => {
    expect((await rpc(listTools)).status).toBe(401);
  });

  it("API_TOKEN 으로는 401", async () => {
    expect((await rpc(listTools, API_TOKEN)).status).toBe(401);
  });

  it("MCP 토큰으로 다른 라우트는 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/memories", {
        headers: { authorization: `Bearer ${MCP_TOKEN}` },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("/mcp 도구", () => {
  it("initialize 에 응답한다", async () => {
    const res = await rpc(
      {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      },
      MCP_TOKEN,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(json.result?.serverInfo?.name).toBe("memory");
  });

  it("save · recall 만 노출한다", async () => {
    const res = await rpc(listTools, MCP_TOKEN);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(json.result.tools.map((t) => t.name).sort()).toEqual(["recall", "save"]);
  });
});
