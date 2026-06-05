import sharp from "sharp";
import type { InputImage } from "./types.js";

// 앱(/api/chat)이 보낸 data URL 이미지를 Claude InputImage 로 변환한다.
// 타입/용량 필터 + 다운스케일(폰 사진은 크므로 필수)을 거친다.

// Anthropic이 받는 이미지 타입. 그 외 첨부(pdf 등)는 무시한다.
const ALLOWED_IMAGE_TYPES = new Set<InputImage["mediaType"]>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
// 이미지당 상한(바이트). API 제한(~5MB) 안쪽으로 잡아 호출 실패를 막는다.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// 사전 필터 상한. 이보다 큰 원본은 디코드조차 하지 않아 메모리를 보호한다.
// 25MB 이하면 downscale()로 1568px 이하로 줄여 API 한도 안에 들어갈 수 있다.
const MAX_INPUT_IMAGE_BYTES = 25 * 1024 * 1024;
// 긴 변 상한(px). 휴대폰 스크린샷처럼 큰 이미지는 Claude가 거부("dimensions exceed
// 2000x2000px")하므로 보내기 전에 비율 유지로 축소한다. 1568은 Anthropic 권장
// 다운스케일 기준 — 이 이하면 추가 리사이즈 없이 토큰/비용도 최소.
const MAX_IMAGE_EDGE = 1568;

// 큰 이미지를 긴 변 MAX_IMAGE_EDGE 이하로 축소(원본이 작으면 그대로). gif는 sharp가
// 정적 프레임으로 다루므로 png로 변환한다. 실패 시 원본 base64로 폴백.
async function downscale(
  buf: Buffer,
  mediaType: InputImage["mediaType"],
): Promise<InputImage> {
  try {
    const img = sharp(buf);
    const meta = await img.metadata();
    const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (longEdge <= MAX_IMAGE_EDGE) {
      return { mediaType, data: buf.toString("base64") };
    }
    const resized = img.resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    });
    // 원본 포맷 유지(gif → png). 재인코딩으로 용량도 함께 줄어든다.
    const { out, type } =
      mediaType === "image/png"
        ? { out: resized.png(), type: "image/png" as const }
        : mediaType === "image/webp"
          ? { out: resized.webp(), type: "image/webp" as const }
          : mediaType === "image/gif"
            ? { out: resized.png(), type: "image/png" as const }
            : { out: resized.jpeg({ quality: 85 }), type: "image/jpeg" as const };
    const data = (await out.toBuffer()).toString("base64");
    return { mediaType: type, data };
  } catch (err) {
    console.error("[image] 리사이즈 실패, 원본 사용:", err);
    return { mediaType, data: buf.toString("base64") };
  }
}

// 앱(/api/chat)이 보낸 data URL(`data:<mime>;base64,<data>`) 배열을 InputImage 로 변환.
// 타입/용량 필터 + 다운스케일(폰 사진은 크므로 필수)을 거친다.
export async function collectImagesFromDataUrls(
  dataUrls: string[],
): Promise<InputImage[]> {
  const images: InputImage[] = [];
  for (const url of dataUrls) {
    if (typeof url !== "string") continue;
    const match = /^data:([^,;]+)(?:;[^,]*)?;base64,(.+)$/s.exec(url);
    if (!match) continue;
    const ct = match[1].trim() as InputImage["mediaType"];
    if (!ALLOWED_IMAGE_TYPES.has(ct)) continue;
    try {
      const buf = Buffer.from(match[2], "base64");
      if (buf.byteLength > MAX_INPUT_IMAGE_BYTES) {
        console.warn(`[image] 이미지 용량 초과로 건너뜀: ${buf.byteLength}B`);
        continue;
      }
      const result = await downscale(buf, ct);
      const outputBytes = Buffer.byteLength(result.data, "base64");
      if (outputBytes > MAX_IMAGE_BYTES) {
        console.warn(`[image] 다운스케일 후에도 용량 초과로 건너뜀: ${outputBytes}B`);
        continue;
      }
      images.push(result);
    } catch (err) {
      console.error("[image] 이미지 디코드 실패:", err);
    }
  }
  return images;
}
