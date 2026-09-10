// T020 — jsonb ↔ 일급 필드 매핑. data-model.md 의 규칙을 고정한다.
import { describe, expect, it } from "vitest";
import {
  mergeMetadata,
  normalizeProject,
  parseMetadata,
  toMemory,
  toMetadata,
  type MemoryRow,
} from "./mapping";

const row = (over: Partial<MemoryRow> = {}): MemoryRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  content: "나비스에 집중하기로 했다",
  category: "decision",
  project: null,
  metadata: {},
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
  ...over,
});

describe("toMemory()", () => {
  it("metadata 안의 tags 를 일급 필드로 올린다", () => {
    const m = toMemory(row({ metadata: { tags: ["a", "b"] } }));
    expect(m.tags).toEqual(["a", "b"]);
  });

  it("tags 가 없으면 빈 배열 — undefined 를 내보내지 않는다", () => {
    expect(toMemory(row()).tags).toEqual([]);
  });

  it("분류가 6개 값 중 하나가 아니면 null 로 좁힌다", () => {
    expect(toMemory(row({ category: "garbage" })).category).toBeNull();
    expect(toMemory(row({ category: null })).category).toBeNull();
  });

  it.each(["decision", "learning", "idea", "feeling", "people", "todo"])(
    "허용 분류 %s 는 통과한다",
    (c) => {
      expect(toMemory(row({ category: c })).category).toBe(c);
    },
  );

  it("project 가 null 이면 개인·전역 기억으로 남는다", () => {
    expect(toMemory(row({ project: null })).project).toBeNull();
    expect(toMemory(row({ project: "navis" })).project).toBe("navis");
  });

  // done 은 할 일에만 의미가 있다. false 로 내보내면 "미완료 할 일"과 구별되지 않는다.
  it("할 일이 아니면 done 이 null", () => {
    expect(toMemory(row({ category: "decision" })).done).toBeNull();
  });

  it("할 일이면 done 이 boolean — 없으면 false", () => {
    expect(toMemory(row({ category: "todo" })).done).toBe(false);
    expect(toMemory(row({ category: "todo", metadata: { done: true } })).done).toBe(true);
  });

  it("createdAt 은 ISO 8601 문자열", () => {
    expect(toMemory(row()).createdAt).toBe("2026-09-10T00:00:00.000Z");
  });

  it("임베딩을 밖으로 내보내지 않는다", () => {
    expect(Object.keys(toMemory(row()))).not.toContain("embedding");
  });
});

describe("parseMetadata()", () => {
  it("손상된 값을 걸러낸다", () => {
    expect(parseMetadata({ tags: ["ok", 1, null], done: "yes" })).toEqual({
      tags: ["ok"],
    });
  });

  it.each([null, undefined, 42, "x", []])("%s 는 빈 객체로", (v) => {
    expect(parseMetadata(v)).toEqual({});
  });
});

describe("toMetadata() / mergeMetadata()", () => {
  it("빈 값은 jsonb 에 넣지 않는다", () => {
    expect(toMetadata({ tags: [], relatedIds: [] })).toEqual({});
  });

  it("왕복이 손실 없다", () => {
    const input = { tags: ["a"], done: true, relatedIds: ["x"] };
    expect(parseMetadata(toMetadata(input))).toEqual(input);
  });

  // 통째로 덮으면 태그를 고칠 때 done 이 사라진다.
  it("부분 갱신이 다른 필드를 지우지 않는다", () => {
    const merged = mergeMetadata({ tags: ["old"], done: true }, { tags: ["new"] });
    expect(merged).toEqual({ tags: ["new"], done: true });
  });

  it("false 로도 갱신된다 — undefined 와 구별한다", () => {
    expect(mergeMetadata({ done: true }, { done: false })).toEqual({ done: false });
    expect(mergeMetadata({ done: true }, {})).toEqual({ done: true });
  });
});

describe("normalizeProject()", () => {
  it("빈 문자열은 개인 기억(null)으로 되돌린다", () => {
    expect(normalizeProject("")).toBeNull();
    expect(normalizeProject("   ")).toBeNull();
  });

  it("undefined 는 '건드리지 않음' 이라 그대로 통과한다", () => {
    expect(normalizeProject(undefined)).toBeUndefined();
  });

  it("공백을 다듬는다", () => {
    expect(normalizeProject("  navis ")).toBe("navis");
  });
});
