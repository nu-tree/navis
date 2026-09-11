// 첨부 이미지 — data URL 을 SDK 가 받는 이미지 블록으로 바꾼다.
//
// ★ 문자열 프롬프트로는 이미지를 실을 수 없다. query() 의 prompt 는
//   `string | AsyncIterable<SDKUserMessage>` 이고, 이미지는 후자의 message.content
//   배열에 블록으로 들어간다.

/** 와이어 계약(chatRequestSchema.images)의 상한과 일치해야 한다. */
export const MAX_IMAGES = 8;

/** Anthropic Messages API 가 받는 이미지 타입. 그 밖은 거부한다. */
const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: MediaType; data: string };
};

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i;

/**
 * data URL 하나를 이미지 블록으로.
 *
 * 지원하지 않는 형식은 **조용히 버리지 않고** 던진다 — 버리면 사용자가 보낸 이미지가
 * 사라진 채 답이 오고, 왜 안 보였는지 알 수 없다.
 */
export const toImageBlock = (dataUrl: string, index: number): ImageBlock => {
  const match = DATA_URL.exec(dataUrl.trim());
  if (!match) {
    throw new Error(
      `${index + 1}번째 이미지가 base64 data URL 이 아니다. ` +
        `'data:image/png;base64,...' 형태여야 한다.`,
    );
  }

  const [, rawType, data] = match;
  const mediaType = rawType?.toLowerCase();
  if (!mediaType || !ALLOWED_MEDIA_TYPES.includes(mediaType as MediaType)) {
    throw new Error(
      `${index + 1}번째 이미지의 형식(${rawType})은 지원하지 않는다. ` +
        `${ALLOWED_MEDIA_TYPES.join(", ")} 중 하나여야 한다.`,
    );
  }
  if (!data) {
    throw new Error(`${index + 1}번째 이미지에 데이터가 없다.`);
  }

  return {
    type: "image",
    source: { type: "base64", media_type: mediaType as MediaType, data },
  };
};

/** 여러 장. 상한을 넘으면 던진다 — 앞의 8장만 쓰고 나머지를 버리지 않는다. */
export const toImageBlocks = (dataUrls: readonly string[]): ImageBlock[] => {
  if (dataUrls.length > MAX_IMAGES) {
    throw new Error(
      `이미지는 한 번에 ${MAX_IMAGES}장까지다 (${dataUrls.length}장 받음).`,
    );
  }
  return dataUrls.map(toImageBlock);
};
