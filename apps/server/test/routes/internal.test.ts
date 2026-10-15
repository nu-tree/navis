// specs/003 T023 — 약속 tick 자격(R10). domain 은 mock — 여기서는 누가 열 수 있는지와 응답 모양만 본다.
// env 는 import 때 한 번 읽히므로, 토큰이 있는 앱과 없는 앱을 모듈을 새로 읽어 따로 만든다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const API_TOKEN = "test-api-token";
const MCP_TOKEN = "test-mcp-token";
const TICK_TOKEN = "test-tick-token";
const MEMBER = "00000000-0000-4000-8000-0000000000a1";

const claimDue = vi.fn(async (): Promise<unknown[]> => []);
const executeRun = vi.fn(async (run: { promise: { id: string } }) => ({
  promiseId: run.promise.id,
  status: "silent",
}));

const claimPending = vi.fn(async (): Promise<unknown[]> => []);
const executeRelay = vi.fn(async (run: { id: string }) => ({ relayId: run.id, status: "delivered" }));

vi.mock("@navis/domain", () => ({
  relay: {
    claimPending: (...a: unknown[]) => claimPending(...(a as [])),
    executeRelay: (...a: unknown[]) => executeRelay(...(a as [{ id: string }])),
  },
  promise: {
    claimDue: (...a: unknown[]) => claimDue(...(a as [])),
    executeRun: (...a: unknown[]) => executeRun(...(a as [{ promise: { id: string } }])),
  },
  conversation: { list: vi.fn(async () => []) },
}));

const loadApp = async (tickToken: string | null) => {
  vi.resetModules();
  vi.stubEnv("API_TOKEN", API_TOKEN);
  vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
  vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
  vi.stubEnv("NAVIS_OWNER_ID", "00000000-0000-4000-8000-000000000001");
  vi.stubEnv("NAVIS_MCP_TOKEN", MCP_TOKEN);
  vi.stubEnv("NAVIS_TICK_TOKEN", tickToken ?? "");
  return (await import("../../src/app")).app;
};

const tick = (app: { fetch: (r: Request) => Response | Promise<Response> }, token?: string) =>
  app.fetch(
    new Request("http://localhost/internal/tick", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

describe("POST /internal/tick — 토큰이 없는 서버", () => {
  it("닫혀 있다(404)", async () => {
    const app = await loadApp(null);
    expect((await tick(app, TICK_TOKEN)).status).toBe(404);
    expect(claimDue).not.toHaveBeenCalled();
  });
});

describe("POST /internal/tick — 토큰이 있는 서버", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["토큰 없음", undefined],
    ["API_TOKEN", API_TOKEN],
    ["MCP 토큰", MCP_TOKEN],
  ])("%s 이면 401", async (_name, token) => {
    const app = await loadApp(TICK_TOKEN);
    expect((await tick(app, token)).status).toBe(401);
    expect(claimDue).not.toHaveBeenCalled();
  });

  it("할 일이 없으면 바로 { claimed: 0 }", async () => {
    const app = await loadApp(TICK_TOKEN);
    const res = await tick(app, TICK_TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 0, results: [] });
    expect(claimDue).toHaveBeenCalledWith(5);
  });

  it("집은 약속을 다 실행한 뒤 결과를 준다", async () => {
    const app = await loadApp(TICK_TOKEN);
    claimDue.mockResolvedValueOnce([
      { runId: "r1", promise: { id: "p1", userId: MEMBER } },
      { runId: "r2", promise: { id: "p2", userId: MEMBER } },
    ]);
    const res = await tick(app, TICK_TOKEN);
    expect(res.status).toBe(200);
    expect(JSON.parse((await res.text()).trim())).toEqual({
      claimed: 2,
      results: [
        { promiseId: "p1", status: "silent" },
        { promiseId: "p2", status: "silent" },
      ],
    });
    expect(executeRun).toHaveBeenCalledTimes(2);
  });

  // specs/004 T013 — 전하기를 먼저 집고, 약속은 남은 몫만 집는다.
  it("전하기를 먼저 집고 약속은 남은 몫만, 결과에 둘 다 섞인다", async () => {
    const app = await loadApp(TICK_TOKEN);
    claimPending.mockResolvedValueOnce([
      { id: "x1", senderId: MEMBER, recipientId: MEMBER, instruction: "a" },
      { id: "x2", senderId: MEMBER, recipientId: MEMBER, instruction: "b" },
    ]);
    claimDue.mockResolvedValueOnce([{ runId: "r1", promise: { id: "p1", userId: MEMBER } }]);
    const res = await tick(app, TICK_TOKEN);
    expect(claimPending).toHaveBeenCalledWith(5);
    expect(claimDue).toHaveBeenCalledWith(3);
    expect(JSON.parse((await res.text()).trim())).toEqual({
      claimed: 3,
      results: [
        { relayId: "x1", status: "delivered" },
        { relayId: "x2", status: "delivered" },
        { promiseId: "p1", status: "silent" },
      ],
    });
  });

  // 이 토큰으로 다른 경로가 열리면 Scheduler 설정에 남은 값으로 대화 API 까지 열린다.
  it("tick 토큰으로는 다른 경로가 열리지 않는다", async () => {
    const app = await loadApp(TICK_TOKEN);
    const res = await app.fetch(
      new Request("http://localhost/conversations", {
        headers: { authorization: `Bearer ${TICK_TOKEN}`, "x-navis-user": MEMBER },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("부팅 검사", () => {
  it("tick 토큰이 API_TOKEN 과 같으면 서버가 뜨지 않는다", async () => {
    await expect(loadApp(API_TOKEN)).rejects.toThrow(/NAVIS_TICK_TOKEN/);
  });
});
