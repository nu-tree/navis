// macOS 데스크톱 아이콘 생성 — 소스 로고(풀블리드 사각)를 mac 스타일로 굽는다:
// 둥근 모서리(rounded-rect) + 바깥 여백(macOS 아이콘 그리드: 1024 캔버스 안에 ~824 본체).
// macOS 는 iOS 와 달리 아이콘을 자동으로 안 둥글려서, 둥근 모양을 PNG 에 직접 구워야 한다.
// 결과 PNG 를 electron-builder mac.icon 으로 주면 그 모양 그대로 .icns 가 생성된다.
//
// 사용: node scripts/make-mac-icon.mjs
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'app', 'assets', 'navis-logo.png');
const OUT = join(here, '..', '..', 'app', 'assets', 'navis-logo-mac.png');

// macOS 아이콘 그리드(Apple Big Sur 템플릿 근사):
//   캔버스 1024, 본체 912(여백 56), 코너 반지름 ≈ 본체의 22.45%.
// 소스(navis-logo.png)가 이미 검정 여백을 품은 패딩본이라(iOS·맥 아이콘 통일), 여기서
// 여백을 더 크게 주면 N 이 이중으로 작아진다 → 여백을 작게(56)만 둬 맥 squircle 이
// 살짝 떠 보이게만 하고, N 패딩은 소스가 담당한다.
const SIZE = 1024;
const MARGIN = 56;
const BODY = SIZE - MARGIN * 2; // 912
const RADIUS = Math.round(BODY * 0.2245); // ≈205

const body = await sharp(SRC)
  .resize(BODY, BODY, { fit: 'cover' })
  .png()
  .toBuffer();

// 둥근 사각 마스크(dest-in 으로 모서리를 깎는다).
const mask = Buffer.from(
  `<svg width="${BODY}" height="${BODY}"><rect width="${BODY}" height="${BODY}" rx="${RADIUS}" ry="${RADIUS}"/></svg>`,
);
const rounded = await sharp(body)
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();

// 투명 여백 위에 둥근 본체를 가운데 배치.
await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: rounded, left: MARGIN, top: MARGIN }])
  .png()
  .toFile(OUT);

console.log(`✅ mac 아이콘 생성: ${OUT} (${SIZE}x${SIZE}, 본체 ${BODY}, 반지름 ${RADIUS})`);
