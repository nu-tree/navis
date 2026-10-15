// specs/004 T012 — 전하기 라우트 계약. domain 은 mock — 누가 열 수 있는지 · 상태 코드 · 응답 모양만 본다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "test-token";
vi.stubEnv("API_TOKEN", TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
const OWNER = "00000000-0000-4000-8000-000000000001";
vi.stubEnv("NAVIS_OWNER_ID", OWNER);

const MEMBER = "00000000-0000-4000-8000-0000000000a1";
const RECIPIENT = { id: "00000000-0000-4000-8000-0000000000b1", label: "jimin@example.com" };

const listMembers = vi.fn(async () => [RECIPIENT]);
const listRelays = vi.fn();
const create = vi.fn();

class FakeTokenMissing extends Error {
  readonly kind = "claude_token_missing" as const;
}

vi.mock("@navis/domain", () => ({
  member: { list: () => listMembers() },
  relay: {
    list: (...a: unknown[]) => listRelays(...a),
    create: (...a: unknown[]) => create(...a),
  },
  chat: { runTurn: vi.fn() },
}));
vi.mock("@navis/domain/errors", () => ({
  isClaudeTokenError: (e: unknown) => e instanceof FakeTokenMissing,
  isNotFound: () => false,
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

const post = (user: string, body: unknown) => req("/relays", user, { method: "POST", body: JSON.stringify(body) });

const ITEM = {
  id: "r1",
  to: RECIPIENT.label,
  instruction: "물 마셨는지 물어봐줘",
  status: "pending",
  error: null,
  createdAt: "2026-10-15T00:00:00.000Z",
  finishedAt: null,
};

describe("/relays — 관리자가 아니면 (FR-001 · FR-002)", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["GET /relays", () => req("/relays", MEMBER)],
    ["GET /relays/members", () => req("/relays/members", MEMBER)],
    ["POST /relays", () => post(MEMBER, { recipientId: RECIPIENT.id, instruction: "x" })],
  ])("%s 는 403 이고 domain 을 부르지 않는다", async (_name, call) => {
    expect((await call()).status).toBe(403);
    expect(listMembers).not.toHaveBeenCalled();
    expect(listRelays).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("/relays — 관리자", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /relays/members 는 회원 목록", async () => {
    const res = await req("/relays/members", OWNER);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([RECIPIENT]);
  });

  it("GET /relays 는 보낸 관리자의 기록이고 messageId 가 없다 (FR-019)", async () => {
    listRelays.mockResolvedValueOnce([ITEM]);
    const res = await req("/relays", OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(listRelays).toHaveBeenCalledWith(OWNER);
    expect(body[0]).not.toHaveProperty("messageId");
  });

  it.each([
    ["본문 없음", null],
    ["uuid 아님", { recipientId: "jimin", instruction: "x" }],
    ["빈 지시", { recipientId: RECIPIENT.id, instruction: "   " }],
    ["너무 긴 지시", { recipientId: RECIPIENT.id, instruction: "가".repeat(1001) }],
  ])("POST — %s 면 400", async (_name, body) => {
    expect((await post(OWNER, body)).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("POST — 목록에 없는 회원이면 404", async () => {
    const res = await post(OWNER, { recipientId: "00000000-0000-4000-8000-0000000000ff", instruction: "x" });
    expect(res.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("POST — 관리자 토큰이 없으면 409 claude_token_missing (FR-023)", async () => {
    create.mockRejectedValueOnce(new FakeTokenMissing("Claude 토큰이 등록되지 않았습니다."));
    const res = await post(OWNER, { recipientId: RECIPIENT.id, instruction: "x" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "claude_token_missing" });
  });

  it("POST — 성공하면 201 RelayItem, 보낸 사람은 요청 회원", async () => {
    create.mockResolvedValueOnce(ITEM);
    const res = await post(OWNER, { recipientId: RECIPIENT.id, instruction: "  물 마셨는지 물어봐줘 " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(ITEM);
    expect(create).toHaveBeenCalledWith(OWNER, RECIPIENT, "물 마셨는지 물어봐줘");
  });
});
