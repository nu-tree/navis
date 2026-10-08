// 첨부 이미지를 보내기 좋은 크기로 줄인다 — 브라우저에서, 보내기 전에.
//
// ★ 긴 변 1568px. Anthropic 이 권장하는 크기로, 이보다 크면 API 가 어차피 줄인다 — 큰 원본은
//   대역폭과 첫 토큰 지연만 늘린다. 레티나 스크린샷(2880px 등)이 대표적이다.
// ★ 바이트 상한. API 의 이미지 하나 한도(5MB 정도)는 base64 로 늘어난 뒤의 크기에도 걸린다고
//   본다. base64 는 원본의 4/3 배라 원본 기준 3.5MB 로 여유를 둔다.
//
// 이미 작으면 다시 인코딩하지 않는다 — 화질이 깎이고 시간만 든다.

const MAX_EDGE = 1568;
const MAX_BYTES = 3.5 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했다."));
    reader.readAsDataURL(blob);
  });

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 변환하지 못했다."))), type, quality),
  );

/** 파일 → 서버로 보낼 data URL. 너무 크면 줄이고, 그래도 크면 JPEG 로 다시 압축한다. */
export async function toUploadDataUrl(file: File): Promise<string> {
  // 움직이는 GIF 는 캔버스를 지나면 첫 프레임만 남는다 — 줄이지 않고 크기만 본다.
  if (file.type === "image/gif") {
    if (file.size > MAX_BYTES) throw new Error(`${file.name} 은 너무 큰 GIF 다.`);
    return readAsDataUrl(file);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= MAX_BYTES) return readAsDataUrl(file);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지를 변환하지 못했다.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // 원래 형식을 먼저 시도한다 — 스크린샷(PNG)의 글자는 JPEG 에서 번진다.
    let blob = await toBlob(canvas, file.type, JPEG_QUALITY);
    if (blob.size > MAX_BYTES && file.type !== "image/jpeg") {
      // JPEG 는 투명을 모른다 — 흰 바탕을 깔지 않으면 투명한 곳이 검게 나온다.
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      blob = await toBlob(canvas, "image/jpeg", JPEG_QUALITY);
    }
    if (blob.size > MAX_BYTES) throw new Error(`${file.name} 은 줄여도 너무 크다.`);
    return readAsDataUrl(blob);
  } finally {
    bitmap.close();
  }
}
