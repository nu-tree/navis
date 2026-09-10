// 기억 임베딩 — Voyage AI. 저장과 검색 양쪽이 이걸 지난다.
//
// 공식 TypeScript SDK 가 없어 HTTP 로 직접 부른다.
//
// ★ 응답을 무가드로 인덱싱하지 않는다. 예전 구현은 `json.data[0].embedding` 을 그대로
//   읽어서, 200 + 빈 `data` 가 오면 TypeError 가 save/recall 밖으로 튀었다
//   (STRUCTURE.md 8항). 여기서는 EmbeddingError 로 바꿔 던진다 — 그래야 라우트가 502 로
//   번역하고 사용자가 실패를 안다(FR-042).

import { EmbeddingError } from "../errors";

/** schema.ts 의 `vector("embedding", { dimensions: 1024 })` 와 반드시 일치해야 한다. */
export const EMBEDDING_DIMENSIONS = 1024;

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

type EmbedOptions = {
  /** 저장할 문서인가, 검색 질의인가. Voyage 는 둘을 다르게 인코딩한다. */
  inputType: "document" | "query";
};

export async function embed(
  text: string,
  options: EmbedOptions,
): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new EmbeddingError("VOYAGE_API_KEY 가 없다 — 기억을 다룰 수 없다.");
  }
  if (!text.trim()) {
    throw new EmbeddingError("빈 문자열은 임베딩할 수 없다.");
  }

  const model = process.env.VOYAGE_MODEL ?? "voyage-3.5";

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model,
      input_type: options.inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  }).catch((cause: unknown) => {
    throw new EmbeddingError("임베딩 서비스에 연결할 수 없다.", cause);
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new EmbeddingError(
      `임베딩 서비스가 ${res.status} 를 돌려줬다: ${detail.slice(0, 200)}`,
    );
  }

  const json: unknown = await res.json().catch((cause: unknown) => {
    throw new EmbeddingError("임베딩 응답이 JSON 이 아니다.", cause);
  });

  // 아래부터가 가드다. 각 단계를 따로 확인해 무엇이 어긋났는지 오류에 남긴다.
  if (typeof json !== "object" || json === null || !("data" in json)) {
    throw new EmbeddingError("임베딩 응답에 data 가 없다.");
  }

  const { data } = json as { data: unknown };
  if (!Array.isArray(data) || data.length === 0) {
    // 200 + 빈 data. 예전 구현이 여기서 TypeError 를 냈다.
    throw new EmbeddingError("임베딩 응답의 data 가 비어 있다.");
  }

  const first: unknown = data[0];
  if (
    typeof first !== "object" ||
    first === null ||
    !("embedding" in first) ||
    !Array.isArray((first as { embedding: unknown }).embedding)
  ) {
    throw new EmbeddingError("임베딩 응답에 embedding 배열이 없다.");
  }

  const vector = (first as { embedding: unknown[] }).embedding;
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    // 차원이 다르면 삽입이 실패한다. 여기서 잡아야 원인을 알 수 있다.
    throw new EmbeddingError(
      `임베딩 차원이 ${vector.length} 다 — ${EMBEDDING_DIMENSIONS} 여야 한다. ` +
        `모델(${model})이 다른 차원을 내는지 확인할 것.`,
    );
  }
  if (!vector.every((n): n is number => typeof n === "number")) {
    throw new EmbeddingError("임베딩 배열에 숫자가 아닌 값이 있다.");
  }

  return vector;
}
