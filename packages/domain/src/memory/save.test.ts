// T026 — save() 의 계약. 이 파일의 존재 이유는 **중복 판정을 하지 않는다**를 고정하는 것이다.
// 나중에 누가 "비슷한 게 있으면 저장하지 말자"를 되살리면 여기서 깨진다(FR-011, Q2).
import { beforeEach, describe, expect, it, vi } from "vitest";

// @navis/db 는 첫 접근에서 실제 연결을 만든다. 단위 테스트에서 DB 를 붙이지 않는다.
const inserted: unknown[] = [];
let nextId = 0;

vi.mock("@navis/db", () => ({
  memories: {
    id: "id",
    content: "content",
    category: "category",
    project: "project",
    metadata: "metadata",
    createdAt: "createdAt",
  },
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return {
          returning: async () => [
            {
              id: `id-${++nextId}`,
              content: v.content as string,
              category: v.category as string | null,
              project: v.project as string | null,
              metadata: v.metadata as unknown,
              createdAt: new Date("2026-09-10T00:00:00.000Z"),
            },
          ],
        };
      },
    }),
  },
}));

vi.mock("./embed", () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => 0.1)),
}));

const { save } = await import("./save");
const { embed } = await import("./embed");

describe("save()", () => {
  beforeEach(() => {
    inserted.length = 0;
    nextId = 0;
    vi.clearAllMocks();
  });

  // ── 이 파일의 핵심 ──────────────────────────────────────────────────
  it("같은 내용을 세 번 저장하면 기억이 3건 생긴다 — 중복 판정을 하지 않는다", async () => {
    const input = { content: "나비스에 집중하기로 했다" };
    const a = await save(input);
    const b = await save(input);
    const c = await save(input);

    expect(inserted).toHaveLength(3);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it("저장 경로에서 유사도 검색을 하지 않는다 — 임베딩은 document 로 한 번만", async () => {
    await save({ content: "x" });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith("x", { inputType: "document" });
  });

  it("판별 유니온이 아니라 Memory 를 바로 돌려준다", async () => {
    const m = await save({ content: "x" });
    expect(m).not.toHaveProperty("skipped");
    expect(m).not.toHaveProperty("duplicates");
    expect(m.id).toBeTruthy();
  });
  // ────────────────────────────────────────────────────────────────────

  it("content 의 공백을 다듬어 저장한다", async () => {
    const m = await save({ content: "  띄어쓰기  " });
    expect(m.content).toBe("띄어쓰기");
  });

  it("공백만 든 content 는 임베딩 전에 거부한다", async () => {
    await expect(save({ content: "   " })).rejects.toThrow();
    expect(embed).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("분류가 없으면 null 로 저장한다", async () => {
    const m = await save({ content: "x" });
    expect(m.category).toBeNull();
  });

  it("project 가 없으면 null — 개인·전역 기억", async () => {
    const m = await save({ content: "x" });
    expect(m.project).toBeNull();
  });

  it("할 일로 저장하면 미완료로 시작한다", async () => {
    const m = await save({ content: "설거지", category: "todo" });
    expect(m.done).toBe(false);
  });

  it("할 일이 아니면 done 을 metadata 에 넣지 않는다", async () => {
    const m = await save({ content: "x", category: "decision" });
    expect(m.done).toBeNull();
    expect(inserted[0]).toMatchObject({ metadata: {} });
  });

  it("태그와 관련 기억을 metadata 로 내려보낸다", async () => {
    await save({ content: "x", tags: ["a"], relatedIds: ["r1"] });
    expect(inserted[0]).toMatchObject({
      metadata: { tags: ["a"], relatedIds: ["r1"] },
    });
  });

  it("임베딩이 실패하면 저장하지 않는다", async () => {
    vi.mocked(embed).mockRejectedValueOnce(new Error("임베딩 실패"));
    await expect(save({ content: "x" })).rejects.toThrow("임베딩 실패");
    expect(inserted).toHaveLength(0);
  });
});
