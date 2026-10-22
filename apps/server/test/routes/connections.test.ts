// MCP 연결 관리. 지키는 것: 회원을 첫 인자로 넘긴다 · 목록에 원문이 없다 · 남의 연결은 404.
import { describe, expect, it, vi } from "vitest";

const API_TOKEN = "test-api-token";
vi.stubEnv("API_TOKEN", API_TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
vi.stubEnv("NAVIS_OWNER_ID", "00000000-0000-4000-8000-000000000001");

const MEMBER = "00000000-0000-4000-8000-0000000000a1";
const conn = { id: "00000000-0000-4000-8000-0000000000c1", label: "노트북", kind: "token", createdAt: "2026-10-22T00:00:00.000Z", lastUsedAt: null };

const issue = vi.fn(async (_u: string, label?: string) => ({ token: "navis_secret", connection: { ...conn, label: label ?? "직접 연결" } }));
const list = vi.fn(async (_u: string) => [conn]);
const revoke = vi.fn(async (u: string, id: string) => u === MEMBER && id === conn.id);
vi.mock("@navis/domain", () => ({
  mcpAccess: { issue, list, revoke, verify: vi.fn() },
  memory: {},
  conversation: {},
  settings: {},
  chat: {},
}));

const { app } = await import("../../src/app");

const call = (path: string, init: RequestInit = {}) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { authorization: `Bearer ${API_TOKEN}`, "x-navis-user": MEMBER, "content-type": "application/json" },
    }),
  );

describe("/connections", () => {
  it("목록은 그 회원의 것이고 원문이 없다", async () => {
    const res = await call("/connections");
    expect(await res.json()).toEqual({ items: [conn] });
    expect(list).toHaveBeenCalledWith(MEMBER);
  });

  it("발급은 201 + 원문 한 번", async () => {
    const res = await call("/connections", { method: "POST", body: JSON.stringify({ label: "회사 PC" }) });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ token: "navis_secret", connection: { label: "회사 PC" } });
    expect(issue).toHaveBeenCalledWith(MEMBER, "회사 PC");
  });

  it("끊기 — 자기 것은 204, 아니면 404", async () => {
    expect((await call(`/connections/${conn.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await call("/connections/00000000-0000-4000-8000-0000000000ff", { method: "DELETE" })).status).toBe(404);
  });
});
