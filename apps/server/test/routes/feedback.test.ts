// 피드백 라우트 계약. domain 은 mock — 누가 열 수 있는지 · 상태 코드 · 응답 모양만 본다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "test-token";
vi.stubEnv("API_TOKEN", TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
const OWNER = "00000000-0000-4000-8000-000000000001";
vi.stubEnv("NAVIS_OWNER_ID", OWNER);

const MEMBER = "00000000-0000-4000-8000-0000000000a1";

class FakeNotFound extends Error {}

const list = vi.fn();
const setDone = vi.fn();

vi.mock("@navis/domain", () => ({
  feedback: {
    list: (...a: unknown[]) => list(...a),
    setDone: (...a: unknown[]) => setDone(...a),
  },
  chat: { runTurn: vi.fn() },
}));
vi.mock("@navis/domain/errors", () => ({
  isClaudeTokenError: () => false,
  isNotFound: (e: unknown) => e instanceof FakeNotFound,
  isEmbeddingError: () => false,
}));

const { app } = await import("../../src/app");

const req = (path: string, user: string, init: RequestInit = {}) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "x-navis-user": user,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    }),
  );

const patch = (user: string, id: string, body: unknown) =>
  req(`/feedback/${id}`, user, { method: "PATCH", body: JSON.stringify(body) });

const ITEM = {
  id: "f1",
  from: "jimin@example.com",
  text: "기억 화면에서 검색이 느려요",
  done: false,
  createdAt: "2026-10-23T00:00:00.000Z",
};

beforeEach(() => {
  list.mockReset().mockResolvedValue([ITEM]);
  setDone.mockReset().mockResolvedValue({ ...ITEM, done: true });
});

describe("/feedback", () => {
  it("관리자가 아니면 목록 · 처리 표시 모두 403", async () => {
    expect((await req("/feedback", MEMBER)).status).toBe(403);
    expect((await patch(MEMBER, "f1", { done: true })).status).toBe(403);
    expect(list).not.toHaveBeenCalled();
    expect(setDone).not.toHaveBeenCalled();
  });

  it("관리자는 목록을 본다", async () => {
    const res = await req("/feedback", OWNER);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([ITEM]);
  });

  it("처리 표시 — 잘못된 본문 400, 없는 피드백 404, 정상 200", async () => {
    expect((await patch(OWNER, "f1", { done: "yes" })).status).toBe(400);

    setDone.mockRejectedValueOnce(new FakeNotFound());
    expect((await patch(OWNER, "nope", { done: true })).status).toBe(404);

    const res = await patch(OWNER, "f1", { done: true });
    expect(res.status).toBe(200);
    expect(setDone).toHaveBeenLastCalledWith("f1", true);
  });
});
