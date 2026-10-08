// 채팅 턴의 토큰 오류 계약(FR-056). 토큰이 없거나 거부되면 SSE error 에 code 가 실리고,
// 사용자 질문은 이미 기록돼 있다(FR-048).
import { describe, expect, it, vi } from "vitest";
import {
  ClaudeTokenMissingError,
  ClaudeTokenRejectedError,
  NotFoundError,
} from "@navis/domain/errors";

const API_TOKEN = "test-api-token";
vi.stubEnv("API_TOKEN", API_TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
vi.stubEnv("NAVIS_OWNER_ID", "00000000-0000-4000-8000-000000000001");

/** 이 파일의 요청 회원(BFF 가 x-navis-user 로 붙이는 값). */
const MEMBER = "00000000-0000-4000-8000-0000000000a1";

const runTurn = vi.fn();
const ensure = vi.fn(async () => ({ sessionId: null, messages: [] }));
const appendMessage = vi.fn(async () => ({ id: "m1", role: "user", text: "x", createdAt: "" }));
vi.mock("@navis/domain", () => ({
  chat: { runTurn: (...a: unknown[]) => runTurn(...a) },
  conversation: {
    ensure: (...a: unknown[]) => ensure(...(a as [])),
    appendMessage: (...a: unknown[]) => appendMessage(...(a as [])),
    setSessionId: vi.fn(),
  },
  memory: {},
  settings: {},
}));

const { app } = await import("../app");

const send = async () => {
  const res = await app.fetch(
    new Request("http://localhost/chat", {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_TOKEN}`,
        "x-navis-user": MEMBER,
        "content-type": "application/json",
      },
      body: JSON.stringify({ conversationId: "room-1", text: "안녕", turnId: crypto.randomUUID() }),
    }),
  );
  const text = await res.text();
  return text
    .split("\n\n")
    .map((f) => f.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim())
    .filter((d): d is string => !!d)
    .map((d) => JSON.parse(d) as { type: string; code?: string });
};

describe("POST /chat — 토큰 오류", () => {
  it("토큰이 없으면 error.code = claude_token_missing, 질문은 기록된다", async () => {
    appendMessage.mockClear();
    runTurn.mockRejectedValueOnce(new ClaudeTokenMissingError());
    const events = await send();
    expect(events.at(-1)).toMatchObject({ type: "error", code: "claude_token_missing" });
    expect(appendMessage).toHaveBeenCalledTimes(1); // 사용자 질문만
  });

  it("거부되면 error.code = claude_token_rejected", async () => {
    runTurn.mockRejectedValueOnce(new ClaudeTokenRejectedError("authentication_failed"));
    const events = await send();
    expect(events.at(-1)).toMatchObject({ type: "error", code: "claude_token_rejected" });
  });

  it("그 밖의 실패에는 code 가 없다", async () => {
    runTurn.mockRejectedValueOnce(new Error("boom"));
    const events = await send();
    expect(events.at(-1)).toMatchObject({ type: "error" });
    expect(events.at(-1)).not.toHaveProperty("code");
  });
});

describe("POST /chat — 회원 분리 (specs/002)", () => {
  it("domain 에 이 요청의 회원을 넘긴다", async () => {
    runTurn.mockResolvedValueOnce({ text: "답", sessionId: null, toolsUsed: [], savedCount: 0 });
    await send();
    expect(ensure).toHaveBeenLastCalledWith(MEMBER, "room-1", "안녕");
    expect(runTurn).toHaveBeenLastCalledWith(expect.objectContaining({ userId: MEMBER }), expect.anything());
  });

  it("남의 방이면 스트림을 열기 전에 404 — 질문을 기록하지 않는다", async () => {
    appendMessage.mockClear();
    ensure.mockRejectedValueOnce(new NotFoundError("conversation", "room-1"));
    const res = await app.fetch(
      new Request("http://localhost/chat", {
        method: "POST",
        headers: {
          authorization: `Bearer ${API_TOKEN}`,
          "x-navis-user": MEMBER,
          "content-type": "application/json",
        },
        body: JSON.stringify({ conversationId: "room-1", text: "x", turnId: crypto.randomUUID() }),
      }),
    );
    expect(res.status).toBe(404);
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("남의 turnId 로는 멈추지 않는다 — found: false", async () => {
    const cancel = (member: string, turnId: string) =>
      app.fetch(
        new Request("http://localhost/chat/cancel", {
          method: "POST",
          headers: {
            authorization: `Bearer ${API_TOKEN}`,
            "x-navis-user": member,
            "content-type": "application/json",
          },
          body: JSON.stringify({ turnId }),
        }),
      );

    // 턴 하나를 진행 중으로 만들어 둔다 — abort 될 때까지 끝나지 않는 runTurn.
    const turnId = crypto.randomUUID();
    let aborted = false;
    runTurn.mockImplementationOnce(
      (input: { abortController: AbortController }) =>
        new Promise((_, reject) =>
          input.abortController.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          }),
        ),
    );
    const pending = app.fetch(
      new Request("http://localhost/chat", {
        method: "POST",
        headers: {
          authorization: `Bearer ${API_TOKEN}`,
          "x-navis-user": MEMBER,
          "content-type": "application/json",
        },
        body: JSON.stringify({ conversationId: "room-2", text: "x", turnId }),
      }),
    );
    const res = await pending;
    const reading = res.text();
    await new Promise((r) => setTimeout(r, 20));

    const other = await cancel("00000000-0000-4000-8000-0000000000c3", turnId);
    expect(await other.json()).toEqual({ ok: true, found: false });
    expect(aborted).toBe(false);

    const mine = await cancel(MEMBER, turnId);
    expect(await mine.json()).toEqual({ ok: true, found: true });
    await reading;
    expect(aborted).toBe(true);
  });
});
