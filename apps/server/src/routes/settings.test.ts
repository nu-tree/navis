// T096 — Claude 토큰 설정 라우트. 지키는 것: 어떤 응답에도 보낸 토큰 원문이 없다(FR-037).
// domain 은 mock 한다 — 암호화 · 저장은 domain 테스트가 실제 DB 로 본다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const API_TOKEN = "test-api-token";
vi.stubEnv("API_TOKEN", API_TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));

const SECRET = "sk-ant-oat01-super-secret-1234";
let stored: string | null = null;
const status = () =>
  stored
    ? { registered: true, last4: stored.slice(-4), updatedAt: "2026-10-08T00:00:00.000Z" }
    : { registered: false, last4: null, updatedAt: null };

class SecretError extends Error {}
vi.mock("@navis/domain", () => ({
  settings: {
    SecretError,
    claudeToken: {
      status: vi.fn(async () => status()),
      set: vi.fn(async (t: string) => ((stored = t), status())),
      remove: vi.fn(async () => ((stored = null), status())),
    },
  },
  memory: {},
  conversation: {},
  chat: { runTurn: vi.fn() },
}));

const { app } = await import("../app");

const req = (method: string, body?: unknown, token: string | null = API_TOKEN) =>
  app.fetch(
    new Request("http://localhost/settings/claude-token", {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe("/settings/claude-token", () => {
  beforeEach(() => {
    stored = null;
  });

  it("토큰 없이 401 (기본 잠금)", async () => {
    expect((await req("GET", undefined, null)).status).toBe(401);
  });

  it("PUT 응답과 이후 GET 응답에 보낸 원문이 없다", async () => {
    const put = await req("PUT", { token: SECRET });
    expect(put.status).toBe(200);
    expect(await put.text()).not.toContain(SECRET);

    const get = await req("GET");
    const text = await get.text();
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text)).toMatchObject({ registered: true, last4: "1234" });
  });

  it("빈 값 · 공백뿐인 값은 400 — 지우려면 DELETE", async () => {
    expect((await req("PUT", { token: "" })).status).toBe(400);
    expect((await req("PUT", { token: "   " })).status).toBe(400);
  });

  // 검증 오류 응답에 받은 값이 실리면 그것도 원문 노출이다.
  it("400 응답에도 받은 값이 없다", async () => {
    const res = await req("PUT", { token: 123, extra: SECRET });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain(SECRET);
  });

  it("DELETE 후 registered: false", async () => {
    await req("PUT", { token: SECRET });
    const res = await req("DELETE");
    expect(await res.json()).toEqual({ registered: false, last4: null, updatedAt: null });
  });
});
