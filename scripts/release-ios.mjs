#!/usr/bin/env node
// 나비스 iOS 원클릭 릴리스(네이티브 재빌드용).
//   버전 올림 → Release 빌드(xcodebuild) → .ipa 패키징 + navis 업로드 + 옛버전 정리.
// 그 뒤 폰 SideStore 에서 나비스 "Update" 한 번 누르면 끝(데이터 보존).
//
// ※ JS/화면/로직만 바뀐 거면 이거 말고 `pnpm ota -- -m "..."`(eas update) 로 충분하다
//   (재빌드·맥 무관). 이 스크립트는 네이티브가 바뀌었을 때만.
//
// 핵심: 서명 없이(CODE_SIGNING_ALLOWED=NO) 빌드한다 — 서명은 SideStore 가 폰에서 다시
// 하므로 불필요. 덕분에 아이폰 USB 연결도, Apple 개발 인증서도 필요 없다.
// (expo run:ios 는 빌드 후 설치+Metro 개발서버를 띄우고 안 끝나서 부적합 → xcodebuild 직접.)
//
// 사용:
//   pnpm release:ios                 # patch 올림 (0.1.2 → 0.1.3)
//   pnpm release:ios minor|major     # 0.2.0 / 1.0.0
//   pnpm release:ios 0.5.0           # 명시 버전
//   pnpm release:ios --no-bump       # 버전 유지(채널 수정 등 재빌드만)
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(ROOT, "packages/app");
const APP_JSON = join(APP_DIR, "app.json");
const EXPO_PLIST = join(APP_DIR, "ios/app/Supporting/Expo.plist");
const INFO_PLIST = join(APP_DIR, "ios/app/Info.plist");

const args = process.argv.slice(2);
const noBump = args.includes("--no-bump");
const bumpArg = args.find((a) => !a.startsWith("--")) ?? "patch";

// plist 의 <key>…</key><string>값</string> 한 항목을 value 로 치환.
function setPlistString(file, key, value) {
  if (!existsSync(file)) return;
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  const txt = readFileSync(file, "utf8");
  if (re.test(txt)) writeFileSync(file, txt.replace(re, `$1${value}$2`));
}

// 1) 버전 계산.
const app = JSON.parse(readFileSync(APP_JSON, "utf8"));
let version = app.expo.version;
if (!noBump) {
  const [maj, min, pat] = version.split(".").map(Number);
  if (bumpArg === "patch") version = `${maj}.${min}.${pat + 1}`;
  else if (bumpArg === "minor") version = `${maj}.${min + 1}.0`;
  else if (bumpArg === "major") version = `${maj + 1}.0.0`;
  else if (/^\d+\.\d+\.\d+$/.test(bumpArg)) version = bumpArg;
  else {
    console.error(`[release:ios] 인자가 이상함: "${bumpArg}" (patch|minor|major|x.y.z)`);
    process.exit(1);
  }
}

// 세 곳을 version 으로 "항상" 동기화한다(--no-bump 여도 정합성 보장):
//   - app.json expo.version    → .ipa 파일명·SideStore 피드 버전
//   - Info.plist CFBundleShortVersionString → .ipa 안의 실제 버전(이게 안 맞으면 SideStore 가
//       "does not match the version specified by the source" 로 설치 거부)
//   - Expo.plist EXUpdatesRuntimeVersion    → OTA 런타임(runtimeVersion=appVersion 정책)
// (xcodebuild 는 prebuild 를 안 거치고 이 파일들을 그대로 굽기 때문에 직접 갱신이 필수.)
app.expo.version = version;
writeFileSync(APP_JSON, JSON.stringify(app, null, 2) + "\n");
setPlistString(INFO_PLIST, "CFBundleShortVersionString", version);
setPlistString(EXPO_PLIST, "EXUpdatesRuntimeVersion", version);
console.log(`[release:ios] 버전 = ${version} (app.json + Info.plist + Expo.plist 동기화)`);

// 2) Release 빌드 — xcodebuild 로 "빌드만". 설치/Metro 없이 끝나고, 서명·기기 불필요.
//    빌드 실패로 옛 .app 을 잘못 올리는 사고를 막으려고 산출물 신선도(mtime)를 검증한다.
const startedAt = Date.now();
console.log("[release:ios] xcodebuild Release 빌드 시작 (서명 없이 · 기기 불필요)…");
try {
  execFileSync(
    "xcodebuild",
    [
      "-workspace",
      "ios/app.xcworkspace",
      "-scheme",
      "app",
      "-configuration",
      "Release",
      "-destination",
      "generic/platform=iOS",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ],
    { cwd: APP_DIR, stdio: "inherit" },
  );
} catch {
  console.log("[release:ios] xcodebuild 비정상 종료 — 산출물 신선도로 판별…");
}

function latestReleaseApp() {
  const dd = join(homedir(), "Library/Developer/Xcode/DerivedData");
  if (!existsSync(dd)) return undefined;
  let best;
  for (const proj of readdirSync(dd)) {
    const rel = join(dd, proj, "Build/Products/Release-iphoneos");
    if (!existsSync(rel)) continue;
    for (const e of readdirSync(rel)) {
      if (!e.endsWith(".app")) continue;
      try {
        const m = statSync(join(rel, e)).mtimeMs;
        if (!best || m > best.mtime) best = { path: join(rel, e), mtime: m };
      } catch {
        /* skip */
      }
    }
  }
  return best;
}

const built = latestReleaseApp();
if (!built || built.mtime < startedAt - 5000) {
  console.error(
    "[release:ios] ✗ 빌드 실패로 판단(새 .app 산출물 없음). 위 빌드 로그의 에러를 확인해줘.\n" +
      "  (네이티브 의존성이 바뀌었으면 먼저 `cd packages/app && npx pod-install` 또는\n" +
      "   `npx expo prebuild -p ios` 후 다시 시도)",
  );
  process.exit(1);
}
console.log(`[release:ios] 빌드 산출물 확인 ✓ ${built.path}`);

// 3) 패키징 + 업로드 + prune (기존 스크립트 재사용)
execFileSync("node", [join(ROOT, "scripts/build-ios-ipa.mjs")], { stdio: "inherit" });

console.log('\n✅ iOS 릴리스 완료. 폰 SideStore → 나비스 "Update" 한 번이면 끝.');
