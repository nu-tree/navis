// specs/004 T011 — 턴 종류별로 열리는 MCP 서버 · 허용 도구(순수 조립).
// 전하기 턴이 약속을 만들거나, 약속 턴이 전하기를 할 수 있으면 권한이 새는 것이다(헌장 보안 절).
import { describe, expect, it } from "vitest";
import { buildTurnTools, turnBudget } from "../../src/chat/index";

const tally = { saved: 0 };
const USER = "00000000-0000-4000-8000-000000000001";

const servers = (t: ReturnType<typeof buildTurnTools>) => Object.keys(t.mcpServers).sort();
const prefixes = (t: ReturnType<typeof buildTurnTools>) =>
  [...new Set(t.allowedTools.filter((n) => n.startsWith("mcp__")).map((n) => n.split("__")[1]))].sort();

describe("buildTurnTools()", () => {
  it("회원 대화 턴 — 기억 + 약속 관리 + 피드백", () => {
    const t = buildTurnTools({ userId: USER, conversationId: "c" }, tally);
    expect(servers(t)).toEqual(["feedback", "memory", "promise"]);
    expect(prefixes(t)).toEqual(["feedback", "memory", "promise"]);
    expect(t.allowedTools).toContain("mcp__feedback__send");
    expect(t.systemPrompt).toContain("## 피드백");
    expect(t.systemPrompt).not.toContain("## 전하기");
  });

  it("약속 턴 — 기억 + 약속 실행, 약속 관리 · 전하기 없음", () => {
    const t = buildTurnTools(
      { userId: USER, promiseRun: { promiseId: "p", label: "l", state: {} } },
      tally,
    );
    expect(servers(t)).toEqual(["memory", "promise_run"]);
    expect(prefixes(t)).toEqual(["memory", "promise_run"]);
    expect(t.allowedTools).not.toContain("mcp__feedback__send");
  });

  it("전하기 턴 — 기억 + deliver 뿐, 약속 도구 없음", () => {
    const t = buildTurnTools({ userId: USER, relayRun: { relayId: "r", state: {} } }, tally);
    expect(servers(t)).toEqual(["memory", "relay_run"]);
    expect(prefixes(t)).toEqual(["memory", "relay_run"]);
    expect(t.allowedTools).toContain("mcp__relay_run__deliver");
    expect(t.systemPrompt).toContain("## 전하기");
    expect(t.systemPrompt).not.toContain("## 약속 실행");
  });

  // specs/004 T024 — 전하기 도구는 관리자의 대화 턴에만(FR-002, research R6).
  it("관리자 대화 턴(canRelay) — 기억 + 약속 관리 + 전하기", () => {
    const t = buildTurnTools({ userId: USER, conversationId: "c", canRelay: true }, tally);
    expect(servers(t)).toEqual(["memory", "promise", "relay"]);
    expect(t.allowedTools).toContain("mcp__relay__relay");
    // 관리자는 자기에게 피드백을 보낼 일이 없다.
    expect(t.allowedTools).not.toContain("mcp__feedback__send");
    expect(t.systemPrompt).not.toContain("## 피드백");
    expect(t.systemPrompt).toContain("## 전하기");
  });

  it("canRelay 가 참이어도 약속 · 전하기 턴에는 전하기 도구가 없다 — 전하기가 전하기를 낳지 않게", () => {
    const promiseTurn = buildTurnTools(
      { userId: USER, canRelay: true, promiseRun: { promiseId: "p", label: "l", state: {} } },
      tally,
    );
    const relayTurn = buildTurnTools({ userId: USER, canRelay: true, relayRun: { relayId: "r", state: {} } }, tally);
    for (const t of [promiseTurn, relayTurn]) {
      expect(servers(t)).not.toContain("relay");
      expect(t.allowedTools).not.toContain("mcp__relay__relay");
    }
  });

  it("회원 대화 턴에는 전하기 도구 · 프롬프트 절이 없다", () => {
    const t = buildTurnTools({ userId: USER, conversationId: "c", canRelay: false }, tally);
    expect(servers(t)).not.toContain("relay");
    expect(t.systemPrompt).not.toContain("relay 의 relay");
  });

  it("어느 턴이든 웹 검색 자동 승인은 그대로다", () => {
    for (const input of [
      { userId: USER },
      { userId: USER, relayRun: { relayId: "r", state: {} } },
    ]) {
      expect(buildTurnTools(input, tally).allowedTools).toContain("WebSearch");
    }
  });
});

// 약속 턴은 아무도 기다리지 않는다 — 찾아보는 약속(뉴스 정리 등)이 검색 몇 번에 바닥나지 않게 연다.
describe("turnBudget()", () => {
  it("대화 · 전하기 턴은 응답성 우선 — medium · 8", () => {
    expect(turnBudget({})).toEqual({ effort: "medium", maxTurns: 8 });
  });

  it("약속 턴은 더 깊게 · 더 오래 — high · 24, 조사 지침이 붙는다", () => {
    const promiseRun = { promiseId: "p", label: "l", state: {} };
    expect(turnBudget({ promiseRun })).toEqual({ effort: "high", maxTurns: 24 });
    expect(buildTurnTools({ userId: USER, promiseRun }, tally).systemPrompt).toContain("### 찾아보는 약속");
  });
});
