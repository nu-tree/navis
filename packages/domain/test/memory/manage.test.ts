// T064 · T068 · T070 — 기억 직접 관리(US4). 재임베딩 여부 · jsonb 의 done · HNSW 이웃 질의는
// mock 으로 알 수 없어 **실제 Postgres** 를 쓴다(conversation/index.test.ts 와 같은 방식).
//
// 테스트 전용 프로젝트 접두사로 격리한다. DATABASE_URL 이 없으면 건너뛴다.
// 임베딩만 mock 한다 — 외부 API 를 부르지 않고, 이웃 순서를 테스트가 정할 수 있게.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_A } from "../test-users";
import { sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import { NotFoundError } from "../../src/errors";

const DIM = 1024;
/** 축 하나만 1 인 벡터에 약간의 기울기 — 축이 같으면 가깝고, 다르면 멀다. */
const axis = (i: number, tilt = 0) =>
  Array.from({ length: DIM }, (_, k) => (k === i ? 1 : k === i + 1 ? tilt : 0));

// 내용 → 벡터. 테스트가 이웃 관계를 직접 정한다.
const VECTORS: Record<string, number[]> = {
  "나비스에 집중한다": axis(0),
  "나비스에만 집중하기로 했다": axis(0, 0.1),
  "나비스 하나에 몰두한다": axis(0, 0.3),
  "점심은 국밥": axis(10),
  "고친 내용": axis(20),
};
vi.mock("../../src/memory/embed", () => ({
  embed: vi.fn(async (text: string) => VECTORS[text] ?? axis(30)),
}));

const { save } = await import("../../src/memory/save");
const { update } = await import("../../src/memory/update");
const { remove } = await import("../../src/memory/remove");
const { todos } = await import("../../src/memory/todos");
const { neighbors } = await import("../../src/memory/neighbors");
const { exportAll, serializeExport } = await import("../../src/memory/export");
const { recent } = await import("../../src/memory/recent");
const { embed } = await import("../../src/memory/embed");

const PROJECT = "test-mem-manage";
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const cleanup = () => db.delete(memories).where(sql`${memories.project} = ${PROJECT}`);
const put = (content: string, extra: Parameters<typeof save>[1] = { content }) =>
  save(USER_A, { ...extra, content, project: PROJECT });

describeDb("기억 직접 관리 (실제 DB)", () => {
  beforeEach(async () => {
    await cleanup();
    vi.clearAllMocks();
  });
  afterAll(cleanup);

  describe("update(USER_A)", () => {
    it("content 를 바꾸면 재임베딩한다 — 고친 내용으로 검색되게(FR-024)", async () => {
      const m = await put("점심은 국밥");
      vi.mocked(embed).mockClear();

      const out = await update(USER_A, { id: m.id, content: "고친 내용" });
      expect(out.content).toBe("고친 내용");
      expect(embed).toHaveBeenCalledTimes(1);
      expect(embed).toHaveBeenCalledWith("고친 내용", { inputType: "document" });
    });

    it("다른 필드만 바꾸면 재임베딩하지 않는다", async () => {
      const m = await put("점심은 국밥");
      vi.mocked(embed).mockClear();

      await update(USER_A, { id: m.id, category: "idea", tags: ["식사"] });
      expect(embed).not.toHaveBeenCalled();
    });

    it("같은 내용으로 저장하면 재임베딩하지 않는다", async () => {
      const m = await put("점심은 국밥");
      vi.mocked(embed).mockClear();

      await update(USER_A, { id: m.id, content: "  점심은 국밥  " });
      expect(embed).not.toHaveBeenCalled();
    });

    // 통째로 덮으면 태그를 고칠 때 done 이 사라진다.
    it("태그를 고쳐도 done 이 남는다", async () => {
      const m = await put("보고서 쓰기", { content: "", category: "todo" });
      await update(USER_A, { id: m.id, done: true });
      const out = await update(USER_A, { id: m.id, tags: ["업무"] });
      expect(out.done).toBe(true);
      expect(out.tags).toEqual(["업무"]);
    });

    it("할 일로 바꾸면 미완료로 시작한다", async () => {
      const m = await put("보고서 쓰기");
      const out = await update(USER_A, { id: m.id, category: "todo" });
      expect(out.done).toBe(false);
    });

    it("category: null 이면 분류를 비운다", async () => {
      const m = await put("점심은 국밥", { content: "", category: "idea" });
      const out = await update(USER_A, { id: m.id, category: null });
      expect(out.category).toBeNull();
    });

    it("빈 project 는 개인 기억으로 되돌린다", async () => {
      const m = await put("점심은 국밥");
      const out = await update(USER_A, { id: m.id, project: "" });
      expect(out.project).toBeNull();
      // 정리에서 빠지지 않게 다시 테스트 프로젝트로.
      await update(USER_A, { id: m.id, project: PROJECT });
    });

    it("공백뿐인 content 는 거부한다", async () => {
      const m = await put("점심은 국밥");
      await expect(update(USER_A, { id: m.id, content: "   " })).rejects.toThrow();
    });

    it("없는 id 는 NotFoundError", async () => {
      await expect(
        update(USER_A, { id: "00000000-0000-0000-0000-000000000000", content: "x" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("uuid 가 아닌 id 도 NotFoundError — DB 형식 오류(500)가 새지 않는다", async () => {
    await expect(remove(USER_A, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    await expect(update(USER_A, { id: "zzz", done: true })).rejects.toBeInstanceOf(NotFoundError);
    await expect(neighbors(USER_A, "zzz")).rejects.toBeInstanceOf(NotFoundError);
  });

  describe("remove(USER_A)", () => {
    it("지운 기억은 목록에서 사라진다", async () => {
      const m = await put("점심은 국밥");
      await expect(remove(USER_A, m.id)).resolves.toEqual({ ok: true });
      const left = await db.select().from(memories).where(sql`${memories.id} = ${m.id}`);
      expect(left).toHaveLength(0);
    });

    it("없는 id 는 NotFoundError", async () => {
      await expect(remove(USER_A, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe("todos(USER_A)", () => {
    it("기본은 미완료만, includeDone 이면 완료도 함께(FR-026)", async () => {
      const open = await put("메일 보내기", { content: "", category: "todo" });
      const closed = await put("회의 잡기", { content: "", category: "todo" });
      await update(USER_A, { id: closed.id, done: true });
      await put("할 일 아닌 것", { content: "", category: "idea" });

      const ids = async (includeDone?: boolean) =>
        (await todos(USER_A, { project: PROJECT, ...(includeDone ? { includeDone } : {}) }))
          .filter((m) => m.project === PROJECT)
          .map((m) => m.id);

      expect(await ids()).toEqual([open.id]);
      expect((await ids(true)).sort()).toEqual([open.id, closed.id].sort());
    });
  });

  describe("neighbors(USER_A)", () => {
    it("가까운 순으로, 자기 자신은 빼고 돌려준다(FR-047)", async () => {
      const a = await put("나비스에 집중한다");
      const b = await put("나비스에만 집중하기로 했다");
      const c = await put("나비스 하나에 몰두한다");
      await put("점심은 국밥");

      const hits = (await neighbors(USER_A, a.id, 3)).filter((h) => h.memory.project === PROJECT);
      expect(hits.map((h) => h.memory.id)).not.toContain(a.id);
      // 기울기가 작은 b 가 c 보다 가깝다.
      expect(hits.slice(0, 2).map((h) => h.memory.id)).toEqual([b.id, c.id]);
      expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    });

    it("없는 id 는 NotFoundError", async () => {
      await expect(neighbors(USER_A, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe("프로젝트 범위", () => {
    it("exactProject 면 개인 기억을 섞지 않고, 기본은 개인 기억도 함께(FR-018)", async () => {
      const mine = await put("점심은 국밥");
      const personal = await save(USER_A, { content: "점심은 국밥" });
      try {
        const exact = await recent(USER_A, { project: PROJECT, exactProject: true, limit: 500 });
        expect(exact.every((m) => m.project === PROJECT)).toBe(true);
        expect(exact.map((m) => m.id)).toContain(mine.id);

        const withPersonal = await recent(USER_A, { project: PROJECT, limit: 500 });
        expect(withPersonal.map((m) => m.id)).toContain(personal.id);

        const personalOnly = await recent(USER_A, { personalOnly: true, limit: 500 });
        expect(personalOnly.every((m) => m.project === null)).toBe(true);
        expect(personalOnly.map((m) => m.id)).not.toContain(mine.id);
      } finally {
        await remove(USER_A, personal.id);
      }
    });
  });

  describe("recent(USER_A) offset", () => {
    it("다음 쪽은 앞 쪽과 겹치지 않고 이어진다", async () => {
      for (const c of ["하나", "둘", "셋"]) await put(c);
      const scope = { project: PROJECT, exactProject: true } as const;
      const first = await recent(USER_A, { ...scope, limit: 2 });
      const second = await recent(USER_A, { ...scope, limit: 2, offset: 2 });
      expect(first).toHaveLength(2);
      expect(second).toHaveLength(1);
      expect(new Set([...first, ...second].map((m) => m.id)).size).toBe(3);
    });
  });

  describe("exportAll(USER_A)", () => {
    it("각 기억에 필드가 빠짐없이 있다(SC-016)", async () => {
      await put("메일 보내기", { content: "", category: "todo", tags: ["업무"] });
      const out = await exportAll(USER_A);
      const mine = out.memories.filter((m) => m.project === PROJECT);

      expect(out.count).toBe(out.memories.length);
      expect(mine).toHaveLength(1);
      for (const key of ["content", "category", "project", "tags", "done", "createdAt"]) {
        expect(mine[0]).toHaveProperty(key);
      }
    });
  });
});

describe("serializeExport()", () => {
  it("0건이어도 유효한 파일을 만든다(FR-051)", () => {
    const text = serializeExport({ exportedAt: "2026-10-08T00:00:00.000Z", count: 0, memories: [] });
    expect(JSON.parse(text)).toEqual({
      exportedAt: "2026-10-08T00:00:00.000Z",
      count: 0,
      memories: [],
    });
  });

  it("사람이 읽을 수 있게 들여쓴다", () => {
    const text = serializeExport({ exportedAt: "x", count: 0, memories: [] });
    expect(text).toContain('\n  "count": 0');
  });
});
