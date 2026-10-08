// specs/002 T006 — 회원 판정 계약(contracts/identity.md).
//   - API_TOKEN 경로는 x-navis-user 가 uuid 이거나 owner 여야 한다. 그 밖은 401 — 관리자로 떨어지지 않는다.
//   - /mcp 는 헤더를 보지 않고 언제나 관리자다.
import { describe, expect, it, vi } from "vitest";

const API_TOKEN = "test-api-token";
const MCP_TOKEN = "test-mcp-token";
const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
vi.stubEnv("API_TOKEN", API_TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
vi.stubEnv("NAVIS_OWNER_ID", OWNER);
vi.stubEnv("NAVIS_MCP_TOKEN", MCP_TOKEN);

// 설정 상태 조회가 받은 회원을 그대로 돌려주게 해서, 판정 결과를 응답으로 본다.
const mcpUsers: string[] = [];
vi.mock("@navis/domain", () => ({
  settings: {
    SecretError: class extends Error {},
    claudeToken: { status: vi.fn(async (userId: string) => ({ userId })) },
  },
  memory: {
    createMemoryMcpServer: vi.fn(({ userId }: { userId: string }) => {
      mcpUsers.push(userId);
      return { instance: { connect: vi.fn(), close: vi.fn() } };
    }),
  },
  conversation: {},
  chat: {},
}));

const { app } = await import("./app");

const whoami = (headers: Record<string, string>) =>
  app.fetch(
    new Request("http://localhost/settings/claude-token", {
      headers: { authorization: `Bearer ${API_TOKEN}`, ...headers },
    }),
  );

describe("회원 판정", () => {
  it("헤더가 없으면 401 — 관리자로 떨어지지 않는다", async () => {
    expect((await whoami({})).status).toBe(401);
  });

  it("uuid 가 아니면 401", async () => {
    expect((await whoami({ "x-navis-user": "abc" })).status).toBe(401);
    expect((await whoami({ "x-navis-user": "OWNER" })).status).toBe(401);
  });

  it("uuid 면 그 회원", async () => {
    const res = await whoami({ "x-navis-user": OTHER });
    expect(await res.json()).toEqual({ userId: OTHER });
  });

  it("owner 는 NAVIS_OWNER_ID 로 바뀐다(로그인이 꺼진 로컬 개발)", async () => {
    const res = await whoami({ "x-navis-user": "owner" });
    expect(await res.json()).toEqual({ userId: OWNER });
  });

  it("서버 토큰이 틀리면 헤더가 맞아도 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/settings/claude-token", {
        headers: { authorization: "Bearer wrong", "x-navis-user": OTHER },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("/mcp 는 헤더를 보지 않고 관리자로 판정한다", async () => {
    mcpUsers.length = 0;
    // 응답을 끝까지 기다리지 않는다 — mock 인스턴스는 MCP 응답을 만들지 않는다. 판정 결과만 본다.
    void Promise.resolve(app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${MCP_TOKEN}`,
          "x-navis-user": OTHER,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    )).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 50));
    expect(mcpUsers).toEqual([OWNER]);
  });
});
