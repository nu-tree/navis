// specs/004 — 관리자 대화의 relay 도구. 받는 사람을 회원 목록 안에서만 정하고, 못 정하면 넣지 않는다(US2-2).
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 은 파일 맨 위로 끌어올려진다 — 팩토리가 쓰는 값도 vi.hoisted 로 함께 올린다.
const { members, create } = vi.hoisted(() => ({
  members: [
    { id: "00000000-0000-4000-8000-0000000000b1", label: "jimin@example.com" },
    { id: "00000000-0000-4000-8000-0000000000b2", label: "jihun@example.com" },
  ],
  create: vi.fn(),
}));

vi.mock("../../src/member/index", async (orig) => ({
  ...(await orig<typeof import("../../src/member/index")>()),
  list: async () => members,
}));
vi.mock("../../src/relay/index", () => ({ create }));

const { handleRelayTool } = await import("../../src/relay/mcp");

const callRelay = ({ to, instruction }: { to: string; instruction: string }) =>
  handleRelayTool("admin", to, instruction);

describe("relay 도구", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockImplementation(async (_senderId: string, member: { label: string }) => ({ to: member.label }));
  });

  it("하나로 정해지면 보낸 관리자 · 그 회원 · 지시 그대로 맡긴다", async () => {
    const res = await callRelay({ to: "jimin", instruction: "회의 11시로 바뀌었다고, 내가 전했다고 해줘" });
    expect(res.isError).toBeFalsy();
    expect(create).toHaveBeenCalledWith("admin", members[0], "회의 11시로 바뀌었다고, 내가 전했다고 해줘");
  });

  it("여럿이면 넣지 않고 후보를 돌려준다", async () => {
    const res = await callRelay({ to: "ji", instruction: "x" });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("jimin@example.com");
    expect(res.content[0]!.text).toContain("jihun@example.com");
    expect(create).not.toHaveBeenCalled();
  });

  it("없으면 넣지 않는다", async () => {
    const res = await callRelay({ to: "철수", instruction: "x" });
    expect(res.isError).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
