// T017 — embed() 의 가드. STRUCTURE.md 8항이 지목한 무가드 인덱싱이 재발하지 않는지 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingError } from "../errors";
import { EMBEDDING_DIMENSIONS, embed, embedMany } from "./embed";

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const validVector = () => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);

describe("embed()", () => {
  beforeEach(() => {
    vi.stubEnv("VOYAGE_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("정상 응답이면 1024차원 벡터를 돌려준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ data: [{ embedding: validVector() }] })),
    );
    const v = await embed("안녕", { inputType: "document" });
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  // 이게 이 파일의 존재 이유다 — 200 + 빈 data 에서 TypeError 가 튀지 않아야 한다.
  it("200 + 빈 data 면 TypeError 가 아니라 EmbeddingError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ data: [] })));
    await expect(embed("안녕", { inputType: "document" })).rejects.toThrow(
      EmbeddingError,
    );
  });

  it("data 키 자체가 없으면 EmbeddingError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ ok: true })));
    await expect(embed("안녕", { inputType: "document" })).rejects.toThrow(
      EmbeddingError,
    );
  });

  it("embedding 배열이 없으면 EmbeddingError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ data: [{ index: 0 }] })));
    await expect(embed("안녕", { inputType: "document" })).rejects.toThrow(
      EmbeddingError,
    );
  });

  it("차원이 다르면 EmbeddingError — 삽입 실패 전에 잡는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ data: [{ embedding: [0.1, 0.2, 0.3] }] })),
    );
    await expect(
      embed("안녕", { inputType: "document" }),
    ).rejects.toThrow(/차원이 3 다/);
  });

  // 4xx 는 요청이 잘못된 것이라 재시도하지 않는다 — 다시 보내도 같은 답이다.
  it("400 은 재시도하지 않고 바로 EmbeddingError", async () => {
    const spy = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", spy);
    await expect(embed("안녕", { inputType: "query" })).rejects.toThrow(
      EmbeddingError,
    );
    expect(spy).toHaveBeenCalledOnce();
  });

  it("연결 실패면 EmbeddingError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(embed("안녕", { inputType: "query" })).rejects.toThrow(
      EmbeddingError,
    );
  });

  it("키가 없으면 부르기 전에 EmbeddingError", async () => {
    vi.stubEnv("VOYAGE_API_KEY", "");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(embed("안녕", { inputType: "query" })).rejects.toThrow(
      EmbeddingError,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("빈 문자열은 부르기 전에 거부한다", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(embed("   ", { inputType: "document" })).rejects.toThrow(
      EmbeddingError,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("embedMany()", () => {
  beforeEach(() => {
    vi.stubEnv("VOYAGE_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("빈 배열은 요청을 보내지 않는다", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await embedMany([], { inputType: "document" })).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("입력 순서를 유지한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { input: string[] };
        return ok({
          data: body.input.map((t) => ({
            embedding: validVector().map(() => t.length),
          })),
        });
      }),
    );
    const out = await embedMany(["a", "bb", "ccc"], { inputType: "document" });
    expect(out.map((v) => v[0])).toEqual([1, 2, 3]);
  });

  it("100개를 넘으면 나눠 보낸다", async () => {
    const spy = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { input: string[] };
      return ok({ data: body.input.map(() => ({ embedding: validVector() })) });
    });
    vi.stubGlobal("fetch", spy);
    const out = await embedMany(Array.from({ length: 250 }, () => "x"), {
      inputType: "document",
    });
    expect(out).toHaveLength(250);
    expect(spy).toHaveBeenCalledTimes(3); // 100 + 100 + 50
  });

  it("글자 수 상한을 넘으면 나눠 보낸다", async () => {
    const spy = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { input: string[] };
      return ok({ data: body.input.map(() => ({ embedding: validVector() })) });
    });
    vi.stubGlobal("fetch", spy);
    // 40,000자 × 3 = 120,000자 → 60,000자 상한에서 3번으로 갈린다
    await embedMany(Array.from({ length: 3 }, () => "가".repeat(40_000)), {
      inputType: "document",
    });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  // 개수가 어긋나면 잘못된 기억에 벡터가 붙는다 — 조용히 틀리는 종류다.
  it("받은 개수가 보낸 개수와 다르면 EmbeddingError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ data: [{ embedding: validVector() }] })),
    );
    await expect(
      embedMany(["a", "b"], { inputType: "document" }),
    ).rejects.toThrow(/개수가 맞지 않는다/);
  });

  it("빈 문자열이 섞여 있으면 몇 번째인지 알려준다", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(
      embedMany(["ok", "  "], { inputType: "document" }),
    ).rejects.toThrow(/1번/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("model 을 넘기면 그 모델로 요청한다 — 재임베딩이 쓴다", async () => {
    const spy = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { model: string };
      expect(body.model).toBe("voyage-3-large");
      return ok({ data: [{ embedding: validVector() }] });
    });
    vi.stubGlobal("fetch", spy);
    await embedMany(["x"], { inputType: "document", model: "voyage-3-large" });
    expect(spy).toHaveBeenCalledOnce();
  });
});

// 결제수단 없는 Voyage 계정은 분당 3회·10K 토큰으로 묶인다. 재시도가 없으면 평소 대화의
// save 조차 "저장 실패"로 끝난다.
describe("429 재시도", () => {
  beforeEach(() => {
    vi.stubEnv("VOYAGE_API_KEY", "test-key");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("429 뒤 성공하면 결과를 돌려준다", async () => {
    let n = 0;
    const spy = vi.fn(async () => {
      n += 1;
      return n === 1
        ? new Response("rate limited", { status: 429 })
        : ok({ data: [{ embedding: validVector() }] });
    });
    vi.stubGlobal("fetch", spy);

    const p = embed("안녕", { inputType: "query" });
    await vi.runAllTimersAsync();
    expect(await p).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("retry-after 헤더를 따른다", async () => {
    let n = 0;
    const spy = vi.fn(async () => {
      n += 1;
      return n === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "7" } })
        : ok({ data: [{ embedding: validVector() }] });
    });
    vi.stubGlobal("fetch", spy);

    const p = embed("안녕", { inputType: "query" });
    await vi.advanceTimersByTimeAsync(6_500);
    expect(spy).toHaveBeenCalledOnce();      // 아직 기다리는 중
    await vi.advanceTimersByTimeAsync(1_000);
    await p;
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("계속 429 면 포기하고 EmbeddingError — 힌트를 붙인다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    const p = embed("안녕", { inputType: "query" });
    const assertion = expect(p).rejects.toThrow(/분당 3회/);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("5xx 도 재시도한다", async () => {
    let n = 0;
    const spy = vi.fn(async () => {
      n += 1;
      return n < 3
        ? new Response("boom", { status: 503 })
        : ok({ data: [{ embedding: validVector() }] });
    });
    vi.stubGlobal("fetch", spy);
    const p = embed("안녕", { inputType: "query" });
    await vi.runAllTimersAsync();
    await p;
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

