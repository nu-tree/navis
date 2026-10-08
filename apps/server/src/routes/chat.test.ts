// 채팅 턴의 토큰 오류 계약(FR-056). 토큰이 없거나 거부되면 SSE error 에 code 가 실리고,
// 사용자 질문은 이미 기록돼 있다(FR-048).
import { describe, expect, it, vi } from "vitest";
import { ClaudeTokenMissingError, ClaudeTokenRejectedError } from "@navis/domain/errors";

const API_TOKEN = "test-api-token";
vi.stubEnv("API_TOKEN", API_TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));

const runTurn = vi.fn();
const appendMessage = vi.fn(async () => ({ id: "m1", role: "user", text: "x", createdAt: "" }));
vi.mock("@navis/domain", () => ({
  chat: { runTurn: (...a: unknown[]) => runTurn(...a) },
  conversation: {
    ensure: vi.fn(async () => ({ sessionId: null, messages: [] })),
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
      headers: { authorization: `Bearer ${API_TOKEN}`, "content-type": "application/json" },
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
