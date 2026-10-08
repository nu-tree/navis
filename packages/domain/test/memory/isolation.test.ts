// specs/002 T009 — 회원 분리(SC-101 · SC-102). 두 회원이 **같은 내용 · 같은 프로젝트 이름**을 써도
// 서로의 것이 어디에도 나오지 않고, 남의 id 로는 아무것도 바뀌지 않는다.
//
// 실제 Postgres 를 쓴다 — 회원 조건이 SQL 에 실제로 들어갔는지는 mock 으로 알 수 없다.
// 이 파일만의 프로젝트 이름으로 격리한다(다른 테스트 파일과 동시에 돈다).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, memories } from "@navis/db";
import { NotFoundError } from "../../src/errors";
import { USER_A, USER_B } from "../test-users";

// 같은 내용이면 같은 벡터 — 내용이 같아도 남의 기억이 이웃으로 나오지 않는지 본다.
const DIM = 1024;
const vec = (seed: number) => Array.from({ length: DIM }, (_, k) => (k === seed ? 1 : 0));
vi.mock("../../src/memory/embed", () => ({
  embed: vi.fn(async (text: string) => vec(text.includes("국밥") ? 1 : 2)),
}));

const { save } = await import("../../src/memory/save");
const { recent } = await import("../../src/memory/recent");
const { recall } = await import("../../src/memory/recall");
const { todos } = await import("../../src/memory/todos");
const { update } = await import("../../src/memory/update");
const { remove } = await import("../../src/memory/remove");
const { neighbors } = await import("../../src/memory/neighbors");
const { exportAll } = await import("../../src/memory/export");
const { projects, renameProject, similarProjects } = await import("../../src/memory/projects");

const PROJECT = "test-iso";
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const cleanup = () =>
  db.delete(memories).where(and(inArray(memories.userId, [USER_A, USER_B]), sql`${memories.project} like ${PROJECT + "%"}`));

describeDb("회원 분리 (실제 DB)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  /** A 와 B 가 같은 내용 · 같은 프로젝트로 하나씩 저장한다. */
  const seed = async () => {
    const a = await save(USER_A, { content: "점심은 국밥", category: "todo", project: PROJECT });
    const b = await save(USER_B, { content: "점심은 국밥", category: "todo", project: PROJECT });
    return { a, b };
  };
  const onlyMine = (ids: string[], mine: string, theirs: string) => {
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  };

  it("목록 · 의미 검색 · 할 일 · 내보내기에 상대 것이 없다", async () => {
    const { a, b } = await seed();
    onlyMine((await recent(USER_A, { project: PROJECT, exactProject: true })).map((m) => m.id), a.id, b.id);
    onlyMine((await recall(USER_A, { query: "점심" })).map((h) => h.memory.id), a.id, b.id);
    onlyMine((await todos(USER_A, { project: PROJECT })).map((m) => m.id), a.id, b.id);
    onlyMine((await exportAll(USER_A)).memories.map((m) => m.id), a.id, b.id);
    onlyMine((await recent(USER_B, { project: PROJECT, exactProject: true })).map((m) => m.id), b.id, a.id);
  });

  it("이웃에 상대 기억이 없다 — 내용이 같아도", async () => {
    const { a, b } = await seed();
    const mine2 = await save(USER_A, { content: "점심은 국밥 또", project: PROJECT });
    const ids = (await neighbors(USER_A, a.id, 10)).map((h) => h.memory.id);
    expect(ids).toContain(mine2.id);
    expect(ids).not.toContain(b.id);
  });

  it("남의 id 로 고치기 · 지우기 · 이웃 보기는 NotFoundError 이고 상대 행은 그대로다", async () => {
    const { b } = await seed();
    await expect(update(USER_A, { id: b.id, content: "바꿔치기" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(remove(USER_A, b.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(neighbors(USER_A, b.id)).rejects.toBeInstanceOf(NotFoundError);
    const [row] = await db.select().from(memories).where(eq(memories.id, b.id));
    expect(row?.content).toBe("점심은 국밥");
  });

  it("프로젝트 목록 · 이름 바꾸기 · 표기 경고는 자기 기억 안에서만", async () => {
    await seed();
    await save(USER_B, { content: "x", project: `${PROJECT}-b` });

    const mine = (await projects(USER_A)).map((p) => p.project);
    expect(mine).toContain(PROJECT);
    expect(mine).not.toContain(`${PROJECT}-b`);

    // A 가 이름을 바꿔도 B 의 같은 이름 프로젝트는 그대로다.
    const r = await renameProject(USER_A, { from: PROJECT, to: `${PROJECT}-renamed` });
    expect(r.moved).toBe(1);
    expect((await projects(USER_B)).map((p) => p.project)).toContain(PROJECT);

    // 표기 경고도 자기 프로젝트끼리만 — B 의 "test-iso-b" 는 A 에게 후보가 아니다.
    expect(await similarProjects(USER_A, `${PROJECT}_b`)).toEqual([]);
  });

  it("상대 프로젝트 이름으로 바꾸기를 해도 상대 것은 옮겨지지 않는다(남의 프로젝트는 없다)", async () => {
    await save(USER_B, { content: "x", project: `${PROJECT}-only-b` });
    await expect(
      renameProject(USER_A, { from: `${PROJECT}-only-b`, to: `${PROJECT}-stolen` }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
