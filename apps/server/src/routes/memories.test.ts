// T033 — 기억 라우트 계약. domain 은 mock 한다(단위 계약 테스트라 DB 를 붙이지 않는다).
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "test-token";
vi.stubEnv("API_TOKEN", TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");

const save = vi.fn();
const recent = vi.fn();
const recall = vi.fn();

vi.mock("@navis/domain", () => ({
  memory: {
    save: (...a: unknown[]) => save(...a),
    recent: (...a: unknown[]) => recent(...a),
    recall: (...a: unknown[]) => recall(...a),
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

  it("쿼리의 limit·days 를 숫자로 넘긴다", async () => {
    recent.mockResolvedValue([]);
    await req("/memories?limit=10&days=7&category=todo");
    expect(recent).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, days: 7, category: "todo" }),
    );
  });

  it("limit 상한(200)을 넘으면 400", async () => {
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
    expect(recall).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });

  // FR-018 — 스코프는 그 프로젝트 + 개인 기억. 필터 자체는 domain 이 하고,
  // 라우트는 값을 그대로 넘기기만 한다.
  it("project 스코프를 그대로 넘긴다", async () => {
    recall.mockResolvedValue([]);
    await req("/memories/search?query=x&project=navis");
    expect(recall).toHaveBeenCalledWith(
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

