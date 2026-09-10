// T017 — embed() 의 가드. STRUCTURE.md 8항이 지목한 무가드 인덱싱이 재발하지 않는지 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingError } from "../errors";
import { EMBEDDING_DIMENSIONS, embed } from "./embed";

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

  it("HTTP 오류면 EmbeddingError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    await expect(embed("안녕", { inputType: "query" })).rejects.toThrow(
      EmbeddingError,
    );
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
