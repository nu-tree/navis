// specs/004 T009 — 받는 사람 정하기(순수). 모델이 고른 이름이 목록 안의 회원 하나로만 정해져야 한다.
import { describe, expect, it } from "vitest";
import { matchMember } from "../../src/member/index";

const m = (id: string, label: string) => ({ id, label });
const MEMBERS = [
  m("1", "jimin@example.com"),
  m("2", "kim@example.com"),
  m("3", "kimchi@example.com"),
  m("4", "Admin@Corp.io"),
  m("5", "abcd1234"), // 로컬 — 이메일 없는 회원
];

describe("matchMember()", () => {
  it("이메일 완전 일치", () => {
    expect(matchMember(MEMBERS, "jimin@example.com")).toEqual({ kind: "one", member: MEMBERS[0] });
  });

  it("이메일 앞부분 일치", () => {
    expect(matchMember(MEMBERS, "jimin")).toEqual({ kind: "one", member: MEMBERS[0] });
  });

  it("앞부분이 정확히 맞으면 포함 단계로 내려가지 않는다", () => {
    expect(matchMember(MEMBERS, "kim")).toEqual({ kind: "one", member: MEMBERS[1] });
  });

  it("앞부분이 to 를 포함", () => {
    expect(matchMember(MEMBERS, "chi")).toEqual({ kind: "one", member: MEMBERS[2] });
  });

  it("대소문자 무시 · 앞뒤 공백 무시", () => {
    expect(matchMember(MEMBERS, "  admin@corp.IO ")).toEqual({ kind: "one", member: MEMBERS[3] });
  });

  it("여럿이면 ambiguous 와 후보", () => {
    expect(matchMember(MEMBERS, "ki")).toEqual({ kind: "ambiguous", candidates: [MEMBERS[1], MEMBERS[2]] });
  });

  it("없으면 none", () => {
    expect(matchMember(MEMBERS, "철수")).toEqual({ kind: "none" });
    expect(matchMember(MEMBERS, "  ")).toEqual({ kind: "none" });
  });

  it("이메일 없는 회원은 표시(uuid 앞 8자)로 맞춘다", () => {
    expect(matchMember(MEMBERS, "abcd1234")).toEqual({ kind: "one", member: MEMBERS[4] });
  });
});
