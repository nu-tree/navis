// 외부 MCP 계약. 지키는 것:
//   1) /mcp 는 NAVIS_MCP_TOKEN 으로만 열린다 — API_TOKEN 으로는 401
//   2) MCP 토큰으로 다른 라우트를 부를 수 없다 — 두 자격이 서로의 범위로 새지 않는다
//   3) 노출하는 도구는 navis 대화와 같은 기억 도구다
//
// domain 은 실물을 쓴다. tools/list 는 DB 를 건드리지 않는다(db 클라이언트는 첫 질의에서 연결).
import { beforeAll, describe, expect, it, vi } from "vitest";

const API_TOKEN = "test-api-token";
const MCP_TOKEN = "test-mcp-token";
vi.stubEnv("API_TOKEN", API_TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
vi.stubEnv("NAVIS_OWNER_ID", "00000000-0000-4000-8000-000000000001");
vi.stubEnv("NAVIS_MCP_TOKEN", MCP_TOKEN);

let app: { fetch: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  ({ app } = await import("../../src/app"));
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

  it("navis 대화와 같은 기억 도구만 노출한다", async () => {
    const res = await rpc(listTools, MCP_TOKEN);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(json.result.tools.map((t) => t.name).sort()).toEqual([
      "projects",
      "recall",
      "recent",
      "remove",
      "rename_project",
      "save",
      "todos",
      "update",
    ]);
  });
});

// 2026-10-08 — GET 에 SSE 스트림을 열었다가 바로 닫아 클라이언트가 초당 수십 번 재연결했다.
// 스트림을 제공하지 않는 서버는 405 로 답한다(MCP 규격) — 클라이언트가 다시 붙지 않는다.
describe("/mcp GET · DELETE", () => {
  it.each(["GET", "DELETE"])("%s 는 405 + Allow: POST", async (method) => {
    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method,
        headers: { authorization: `Bearer ${MCP_TOKEN}`, accept: "text/event-stream" },
      }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("GET 도 MCP 토큰 없이는 401 — 405 가 인증보다 먼저 새지 않는다", async () => {
    const res = await app.fetch(new Request("http://localhost/mcp", { method: "GET" }));
    expect(res.status).toBe(401);
  });
});
