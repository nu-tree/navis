// T056 — 대화방 라우트 계약. domain 은 mock 한다(도메인 동작은 domain 쪽 테스트가 덮는다).
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "test-token";
vi.stubEnv("API_TOKEN", TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");

const list = vi.fn();
const get = vi.fn();
const remove = vi.fn();
const removeMessage = vi.fn();

vi.mock("@navis/domain", () => ({
  memory: { save: vi.fn(), recent: vi.fn(), recall: vi.fn() },
  chat: { runTurn: vi.fn() },
  conversation: {
    list: (...a: unknown[]) => list(...a),
    get: (...a: unknown[]) => get(...a),
    remove: (...a: unknown[]) => remove(...a),
    removeMessage: (...a: unknown[]) => removeMessage(...a),
    ensure: vi.fn(),
    appendMessage: vi.fn(),
    setSessionId: vi.fn(),
  },
}));

vi.mock("@navis/domain/errors", () => ({
  isNotFound: (e: unknown) => e instanceof Error && e.name === "NotFoundError",
  isEmbeddingError: () => false,
}));

const { app } = await import("./../app");

const notFound = () => {
  const e = new Error("conversation 를 찾을 수 없다: zzz");
  e.name = "NotFoundError";
  return e;
};

const req = (path: string, init: RequestInit = {}) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
    }),
  );

const summary = {
  id: "room-1",
  title: "배포 어떻게 할까",
  sessionId: "sess-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  messageCount: 4,
  lastMessage: "마지막 메시지",
};

describe("GET /conversations", () => {
  beforeEach(() => vi.clearAllMocks());

  // FR-032 — 예전 listConversations 의 SELECT * 가 이그레스 사고를 만들었다.
  it("목록 응답에 messages 가 없다", async () => {
    list.mockResolvedValue([summary]);
    const body = (await (await req("/conversations")).json()) as unknown[];
    expect(body[0]).not.toHaveProperty("messages");
    expect(body[0]).toMatchObject({ messageCount: 4, lastMessage: "마지막 메시지" });
  });

  it("빈 목록은 빈 배열 — 404 가 아니다", async () => {
    list.mockResolvedValue([]);
    const res = await req("/conversations");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown[]).toEqual([]);
  });
});

describe("GET /conversations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("단건 조회는 messages 를 포함한다", async () => {
    get.mockResolvedValue({ ...summary, messages: [{ id: "m1", role: "user", text: "x", createdAt: "" }] });
    const body = (await (await req("/conversations/room-1")).json()) as { messages: unknown[] };
    expect(body.messages).toHaveLength(1);
  });

  // 문구를 다듬는 것이 status 를 바꾸면 안 된다.
  it("없는 방은 404 — 500 이 아니다", async () => {
    get.mockRejectedValue(notFound());
    expect((await req("/conversations/없음")).status).toBe(404);
  });

  it("그 밖의 오류는 500", async () => {
    get.mockRejectedValue(new Error("연결 실패"));
    expect((await req("/conversations/room-1")).status).toBe(500);
  });
});

describe("DELETE /conversations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("방을 지운다", async () => {
    remove.mockResolvedValue(undefined);
    expect((await req("/conversations/room-1", { method: "DELETE" })).status).toBe(200);
    expect(remove).toHaveBeenCalledWith("room-1");
  });

  it("없는 방은 404", async () => {
    remove.mockRejectedValue(notFound());
    expect((await req("/conversations/없음", { method: "DELETE" })).status).toBe(404);
  });
});

describe("DELETE /conversations/:id/messages/:messageId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("메시지 하나를 지운다", async () => {
    removeMessage.mockResolvedValue(undefined);
    const res = await req("/conversations/room-1/messages/msg-1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(removeMessage).toHaveBeenCalledWith("room-1", "msg-1");
  });

  it("없는 메시지는 404", async () => {
    removeMessage.mockRejectedValue(notFound());
    const res = await req("/conversations/room-1/messages/없음", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  // 중첩 경로가 /:id 에 잡아먹히면 방 전체가 지워진다 — 치명적이다.
  it("중첩 경로가 방 삭제로 해석되지 않는다", async () => {
    removeMessage.mockResolvedValue(undefined);
    await req("/conversations/room-1/messages/msg-1", { method: "DELETE" });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("기본 잠금", () => {
  it.each([
    "/conversations",
    "/conversations/room-1",
  ])("%s 는 토큰 없이 401", async (path) => {
    const res = await app.fetch(new Request(`http://localhost${path}`));
    expect(res.status).toBe(401);
  });
});
