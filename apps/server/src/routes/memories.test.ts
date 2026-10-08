// T033 — 기억 라우트 계약. domain 은 mock 한다(단위 계약 테스트라 DB 를 붙이지 않는다).
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "test-token";
vi.stubEnv("API_TOKEN", TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
vi.stubEnv("NAVIS_SETTINGS_KEY", Buffer.alloc(32, 1).toString("base64"));
vi.stubEnv("NAVIS_OWNER_ID", "00000000-0000-4000-8000-000000000001");

/** 이 파일의 요청 회원(BFF 가 x-navis-user 로 붙이는 값). */
const MEMBER = "00000000-0000-4000-8000-0000000000a1";

const save = vi.fn();
const recent = vi.fn();
const recall = vi.fn();
const projects = vi.fn();
const renameProject = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const todos = vi.fn();
const neighbors = vi.fn();
const exportAll = vi.fn();

vi.mock("@navis/domain", () => ({
  memory: {
    save: (...a: unknown[]) => save(...a),
    recent: (...a: unknown[]) => recent(...a),
    recall: (...a: unknown[]) => recall(...a),
    projects: (...a: unknown[]) => projects(...a),
    renameProject: (...a: unknown[]) => renameProject(...a),
    update: (...a: unknown[]) => update(...a),
    remove: (...a: unknown[]) => remove(...a),
    todos: (...a: unknown[]) => todos(...a),
    neighbors: (...a: unknown[]) => neighbors(...a),
    exportAll: (...a: unknown[]) => exportAll(...a),
    serializeExport: (d: unknown) => `${JSON.stringify(d, null, 2)}\n`,
  },
  chat: { runTurn: vi.fn() },
}));

class FakeEmbeddingError extends Error {}
vi.mock("@navis/domain/errors", () => ({
  isNotFound: (e: unknown) => e instanceof Error && e.name === "NotFoundError",
  isEmbeddingError: (e: unknown) => e instanceof FakeEmbeddingError,
}));

const { app } = await import("./../app");

const memory = {
  id: "m1",
  content: "나비스에 집중하기로 했다",
  category: "decision" as const,
  project: null,
  tags: [],
  done: null,
  createdAt: "2026-09-10T00:00:00.000Z",
};

const req = (path: string, init: RequestInit = {}) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "x-navis-user": MEMBER,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    }),
  );

const post = (body: unknown) =>
  req("/memories", { method: "POST", body: JSON.stringify(body) });

describe("POST /memories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Memory 를 바로 돌려준다 — 판별 유니온이 아니다", async () => {
    save.mockResolvedValue(memory);
    const res = await post({ content: "x" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("skipped");
    expect(body).not.toHaveProperty("duplicates");
    expect(body.id).toBe("m1");
  });

  it("잘못된 본문은 400 + detail: issues", async () => {
    const res = await post({ content: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.detail).toBeInstanceOf(Array);
    expect(save).not.toHaveBeenCalled();
  });

  it("JSON 이 아니면 400", async () => {
    const res = await req("/memories", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("스키마에 없는 분류는 400", async () => {
    const res = await post({ content: "x", category: "garbage" });
    expect(res.status).toBe(400);
  });

  // 이전 구현은 이걸 500 으로 흘려보냈다. 사용자가 실패를 알아야 한다(FR-042).
  it("임베딩 실패는 502", async () => {
    save.mockRejectedValue(new FakeEmbeddingError("임베딩 응답의 data 가 비어 있다."));
    const res = await post({ content: "x" });
    expect(res.status).toBe(502);
  });

  it("없는 대상 오류는 404 — 500 이 아니다", async () => {
    const e = new Error("memory 를 찾을 수 없다: zzz");
    e.name = "NotFoundError";
    save.mockRejectedValue(e);
    const res = await post({ content: "x" });
    expect(res.status).toBe(404);
  });
});

describe("GET /memories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("목록을 돌려준다", async () => {
    recent.mockResolvedValue([memory]);
    const res = await req("/memories");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown[]).toHaveLength(1);
  });

  it("쿼리의 limit·days·offset 을 숫자로 넘긴다", async () => {
    recent.mockResolvedValue([]);
    await req("/memories?limit=10&days=7&offset=50&category=todo");
    expect(recent).toHaveBeenCalledWith(
      MEMBER,
      expect.objectContaining({ limit: 10, days: 7, offset: 50, category: "todo" }),
    );
  });

  it("since · until 을 그대로 넘긴다", async () => {
    recent.mockResolvedValue([]);
    await req("/memories?since=2026-10-07&until=today");
    expect(recent).toHaveBeenCalledWith(
      MEMBER,
      expect.objectContaining({ since: "2026-10-07", until: "today" }),
    );
  });

  it("형식이 틀린 since 는 400", async () => {
    const res = await req("/memories?since=10월7일");
    expect(res.status).toBe(400);
    expect(recent).not.toHaveBeenCalled();
  });

  it("limit 상한(500)을 넘으면 400", async () => {
    const res = await req("/memories?limit=999");
    expect(res.status).toBe(400);
    expect(recent).not.toHaveBeenCalled();
  });

  it("숫자가 아닌 limit 은 400", async () => {
    const res = await req("/memories?limit=abc");
    expect(res.status).toBe(400);
  });

  it("응답에 embedding 이 실리지 않는다", async () => {
    recent.mockResolvedValue([memory]);
    const [first] = (await (await req("/memories")).json()) as unknown[];
    expect(first).not.toHaveProperty("embedding");
  });
});

describe("GET /memories/search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("RecallHit 배열을 돌려준다", async () => {
    recall.mockResolvedValue([{ memory, score: 0.42 }]);
    const res = await req("/memories/search?query=배포");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ score: number }>;
    expect(body[0]?.score).toBe(0.42);
  });

  it("query 가 없으면 400", async () => {
    const res = await req("/memories/search");
    expect(res.status).toBe(400);
    expect(recall).not.toHaveBeenCalled();
  });

  it("빈 query 는 400", async () => {
    const res = await req("/memories/search?query=");
    expect(res.status).toBe(400);
  });

  // FR-019 — recallInputSchema 의 상한과 일치해야 한다.
  it("limit 상한(50)을 넘으면 400", async () => {
    const res = await req("/memories/search?query=x&limit=51");
    expect(res.status).toBe(400);
    expect(recall).not.toHaveBeenCalled();
  });

  it("limit 을 숫자로 넘긴다", async () => {
    recall.mockResolvedValue([]);
    await req("/memories/search?query=x&limit=5");
    expect(recall).toHaveBeenCalledWith(
      MEMBER,
      expect.objectContaining({ limit: 5 }));
  });

  // FR-018 — 스코프는 그 프로젝트 + 개인 기억. 필터 자체는 domain 이 하고,
  // 라우트는 값을 그대로 넘기기만 한다.
  it("project 스코프를 그대로 넘긴다", async () => {
    recall.mockResolvedValue([]);
    await req("/memories/search?query=x&project=navis");
    expect(recall).toHaveBeenCalledWith(
      MEMBER,
      expect.objectContaining({ project: "navis" }),
    );
  });

  it("결과가 없으면 빈 배열 — 404 가 아니다", async () => {
    recall.mockResolvedValue([]);
    const res = await req("/memories/search?query=없는내용");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown[]).toEqual([]);
  });

  it("임베딩 실패는 502", async () => {
    recall.mockRejectedValue(new FakeEmbeddingError("임베딩 실패"));
    const res = await req("/memories/search?query=x");
    expect(res.status).toBe(502);
  });

  // "search" 가 나중에 붙을 /:id 라우트에 잡아먹히면 안 된다.
  it("정적 경로가 id 로 해석되지 않는다", async () => {
    recall.mockResolvedValue([]);
    await req("/memories/search?query=x");
    expect(recall).toHaveBeenCalled();
  });
});


describe("프로젝트 스코프", () => {
  beforeEach(() => vi.clearAllMocks());

  const rename = (body: unknown) =>
    req("/memories/projects/rename", { method: "POST", body: JSON.stringify(body) });

  it("GET /memories/projects 가 목록을 돌려준다 — id 로 해석되지 않는다", async () => {
    projects.mockResolvedValue([{ project: "navis", count: 3, lastAt: "2026-10-07T00:00:00.000Z" }]);
    const res = await req("/memories/projects");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown[]).toHaveLength(1);
  });

  it("rename 결과를 그대로 돌려준다", async () => {
    renameProject.mockResolvedValue({ from: "soopsns", to: "soop-sns", moved: 4, merged: true });
    const res = await rename({ from: "soopsns", to: "soop-sns" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { merged: boolean }).merged).toBe(true);
  });

  it("from 과 to 가 같으면 400", async () => {
    const res = await rename({ from: "navis", to: " navis " });
    expect(res.status).toBe(400);
    expect(renameProject).not.toHaveBeenCalled();
  });

  it("빈 to 는 400", async () => {
    const res = await rename({ from: "navis", to: "  " });
    expect(res.status).toBe(400);
  });

  it("없는 from 은 404", async () => {
    const e = new Error("project 를 찾을 수 없다: nope");
    e.name = "NotFoundError";
    renameProject.mockRejectedValue(e);
    const res = await rename({ from: "nope", to: "navis" });
    expect(res.status).toBe(404);
  });
});

describe("기억 직접 관리 (US4)", () => {
  beforeEach(() => vi.clearAllMocks());

  const notFound = () => {
    const e = new Error("memory 를 찾을 수 없다: x");
    e.name = "NotFoundError";
    return e;
  };

  it("PATCH 는 경로의 id 로 고친다 — 본문의 id 는 무시한다", async () => {
    update.mockResolvedValue({ ...memory, content: "고친 내용" });
    const res = await req("/memories/m1", {
      method: "PATCH",
      body: JSON.stringify({ id: "other", content: "고친 내용" }),
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      MEMBER,
      expect.objectContaining({ id: "m1", content: "고친 내용" }));
  });

  it("PATCH 의 잘못된 분류는 400", async () => {
    const res = await req("/memories/m1", {
      method: "PATCH",
      body: JSON.stringify({ category: "garbage" }),
    });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("없는 id 의 PATCH · DELETE · neighbors 는 404", async () => {
    update.mockRejectedValue(notFound());
    remove.mockRejectedValue(notFound());
    neighbors.mockRejectedValue(notFound());
    const patch = await req("/memories/x", { method: "PATCH", body: JSON.stringify({ done: true }) });
    const del = await req("/memories/x", { method: "DELETE" });
    const nb = await req("/memories/x/neighbors");
    expect([patch.status, del.status, nb.status]).toEqual([404, 404, 404]);
  });

  it("DELETE 는 { ok }", async () => {
    remove.mockResolvedValue({ ok: true });
    const res = await req("/memories/m1", { method: "DELETE" });
    expect(await res.json()).toEqual({ ok: true });
  });

  it("neighbors 의 limit 상한(20)을 넘으면 400", async () => {
    const res = await req("/memories/m1/neighbors?limit=21");
    expect(res.status).toBe(400);
    expect(neighbors).not.toHaveBeenCalled();
  });

  it("todos 의 includeDone 은 'true' 만 참이다", async () => {
    todos.mockResolvedValue([]);
    await req("/memories/todos?includeDone=false");
    expect(todos).toHaveBeenCalledWith(
      MEMBER,
      expect.objectContaining({ includeDone: false }));
    await req("/memories/todos?includeDone=true");
    expect(todos).toHaveBeenLastCalledWith(
      MEMBER,
      expect.objectContaining({ includeDone: true }));
  });

  // 정적 경로가 /:id 에 잡아먹히면 todos 가 "todos 라는 id 의 기억"이 된다.
  it("/todos · /export 가 /:id 로 해석되지 않는다", async () => {
    todos.mockResolvedValue([]);
    exportAll.mockResolvedValue({ exportedAt: "x", count: 0, memories: [] });
    await req("/memories/todos");
    await req("/memories/export");
    expect(todos).toHaveBeenCalled();
    expect(exportAll).toHaveBeenCalled();
  });

  it("export 는 0건에서도 200 + count: 0 (FR-051)", async () => {
    exportAll.mockResolvedValue({ exportedAt: "2026-10-08T00:00:00.000Z", count: 0, memories: [] });
    const res = await req("/memories/export");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exportedAt: "2026-10-08T00:00:00.000Z", count: 0, memories: [] });
  });
});
