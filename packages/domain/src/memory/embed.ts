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

/**
 * ★ 모델을 바꾸면 **기존 기억 전부가 검색 불가**가 된다. 벡터 공간이 달라져 질의 벡터가
 *   저장된 벡터와 거의 직교하게 되고(실측: 코사인 유사도 0.5 → 0.06), 차원이 같아서
 *   오류도 나지 않는다 — 조용히 틀린 결과만 나온다.
 *
 *   바꿀 때는 반드시 기존 기억을 재임베딩한다: `pnpm --filter @navis/domain reembed`
 *
 *   voyage-4 계열은 무료 200M 토큰 구간에 있고(voyage-3 계열은 없다), 1024차원을 낸다.
 *
 * ★ 유사도 **점수의 절대값에 의존하지 말 것.** 척도가 모델마다 다르다 — 같은 질의·같은
 *   기억에서 voyage-3-large 는 0.5대, voyage-4-large 는 0.3대를 준다(순위는 동일).
 *   "0.4 이상만 쓴다" 같은 임계값을 박으면 모델을 바꾸는 순간 조용히 깨진다.
 *   순위와 상대 비교만 쓴다 — 시간 가중치도 곱셈 형태라 척도에 영향받지 않는다.
 */
const DEFAULT_MODEL = "voyage-4-large";

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

/**
 * 요청당 상한: 텍스트 1,000개 / 120K 토큰(voyage-4-large).
 *
 * 한국어는 토큰 효율이 낮아 최악의 경우 글자당 1토큰에 가깝다. 그래서 글자 수로
 * 보수적으로 끊는다 — 토큰을 세려면 또 왕복이 필요하고, 그럴 가치가 없다.
 */
const MAX_TEXTS_PER_REQUEST = 100;
const MAX_CHARS_PER_REQUEST = 60_000;

/**
 * 429 재시도. Voyage 는 결제수단이 없는 계정을 **분당 3회 / 10K 토큰**으로 묶는다.
 * 그 상태에서는 평소 대화의 save 조차 자주 429 를 맞는다 — 재시도가 없으면 모델이
 * "저장 실패"를 답으로 내보낸다.
 */
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 2_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** `retry-after` 가 있으면 그 값을 따르고, 없으면 지수 백오프. */
const backoffMs = (attempt: number, retryAfter: string | null) => {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return BASE_BACKOFF_MS * 2 ** attempt;
};

type EmbedOptions = {
  /** 저장할 문서인가, 검색 질의인가. Voyage 는 둘을 다르게 인코딩한다. */
  inputType: "document" | "query";
  /** 재임베딩처럼 모델을 명시해야 하는 경우에만 넘긴다. */
  model?: string;
};

const resolveModel = (override?: string) =>
  override ?? process.env.VOYAGE_MODEL ?? DEFAULT_MODEL;

/** 한 번의 HTTP 요청. 응답을 단계별로 가드해 무엇이 어긋났는지 오류에 남긴다. */
async function requestEmbeddings(
  texts: string[],
  { inputType, model }: Required<Pick<EmbedOptions, "inputType">> & { model: string },
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new EmbeddingError("VOYAGE_API_KEY 가 없다 — 기억을 다룰 수 없다.");
  }

  const body = JSON.stringify({
    input: texts,
    model,
    input_type: inputType,
    output_dimension: EMBEDDING_DIMENSIONS,
  });

  let res: Response | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body,
    }).catch((cause: unknown) => {
      throw new EmbeddingError("임베딩 서비스에 연결할 수 없다.", cause);
    });

    // 429(한도) 와 5xx(일시 장애)만 재시도한다. 4xx 는 요청이 잘못된 것이라 다시 보내도 같다.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_RETRIES) break;
    await sleep(backoffMs(attempt, res.headers.get("retry-after")));
  }

  if (!res) throw new EmbeddingError("임베딩 요청을 보내지 못했다.");

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    const hint =
      res.status === 429
        ? " (결제수단이 없는 계정은 분당 3회·10K 토큰으로 제한된다)"
        : "";
    throw new EmbeddingError(
      `임베딩 서비스가 ${res.status} 를 돌려줬다${hint}: ${detail.slice(0, 200)}`,
    );
  }

  const json: unknown = await res.json().catch((cause: unknown) => {
    throw new EmbeddingError("임베딩 응답이 JSON 이 아니다.", cause);
  });

  if (typeof json !== "object" || json === null || !("data" in json)) {
    throw new EmbeddingError("임베딩 응답에 data 가 없다.");
  }

  const { data } = json as { data: unknown };
  if (!Array.isArray(data) || data.length === 0) {
    // 200 + 빈 data. 예전 구현이 여기서 TypeError 를 냈다.
    throw new EmbeddingError("임베딩 응답의 data 가 비어 있다.");
  }
  if (data.length !== texts.length) {
    // 순서로 짝지으므로 개수가 다르면 잘못된 기억에 벡터가 붙는다 — 조용히 틀리는 종류다.
    throw new EmbeddingError(
      `임베딩 개수가 맞지 않는다: 보낸 ${texts.length}개, 받은 ${data.length}개.`,
    );
  }

  return data.map((entry, i) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("embedding" in entry) ||
      !Array.isArray((entry as { embedding: unknown }).embedding)
    ) {
      throw new EmbeddingError(`임베딩 응답 ${i}번에 embedding 배열이 없다.`);
    }
    const vector = (entry as { embedding: unknown[] }).embedding;
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      // 차원이 다르면 삽입이 실패한다. 여기서 잡아야 원인을 알 수 있다.
      throw new EmbeddingError(
        `임베딩 차원이 ${vector.length} 다 — ${EMBEDDING_DIMENSIONS} 여야 한다. ` +
          `모델(${model})이 다른 차원을 내는지 확인할 것.`,
      );
    }
    if (!vector.every((n): n is number => typeof n === "number")) {
      throw new EmbeddingError(`임베딩 배열 ${i}번에 숫자가 아닌 값이 있다.`);
    }
    return vector;
  });
}

/** 텍스트 하나. */
export async function embed(
  text: string,
  options: EmbedOptions,
): Promise<number[]> {
  const [vector] = await embedMany([text], options);
  if (!vector) throw new EmbeddingError("임베딩을 받지 못했다.");
  return vector;
}

/**
 * 여러 텍스트를 한 번에. 반환 순서는 입력 순서와 같다.
 *
 * 상한을 넘지 않게 알아서 나눠 보낸다. 재임베딩(reembed.ts)이 쓴다.
 */
export async function embedMany(
  texts: string[],
  { inputType, model }: EmbedOptions,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const resolved = resolveModel(model);
  const blank = texts.findIndex((t) => !t.trim());
  if (blank !== -1) {
    throw new EmbeddingError(`빈 문자열은 임베딩할 수 없다 (${blank}번).`);
  }

  const out: number[][] = [];
  let batch: string[] = [];
  let chars = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    out.push(...(await requestEmbeddings(batch, { inputType, model: resolved })));
    batch = [];
    chars = 0;
  };

  for (const text of texts) {
    const tooMany = batch.length + 1 > MAX_TEXTS_PER_REQUEST;
    const tooLong = chars + text.length > MAX_CHARS_PER_REQUEST;
    if (batch.length > 0 && (tooMany || tooLong)) await flush();
    batch.push(text);
    chars += text.length;
  }
  await flush();

  return out;
}
