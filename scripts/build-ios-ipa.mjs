#!/usr/bin/env node
// Release .app → .ipa 패키징 + navis 업로드. SideStore 사이드로드 자동배포의 맥 쪽 단계.
//
// 배경: 무료 Apple ID 사이드로드는 7일마다 서명이 만료되고 새 빌드 설치에 맥이 필요했다.
// SideStore 가 폰에서 자동 재서명/OTA 업데이트를 해주는데, 그 입력이 .ipa 다.
// 이 스크립트는 이미 빌드된 Release .app(`expo run:ios --configuration Release` 산출물)을
// 찾아 .ipa 로 감싸고, navis 의 /api/ios/upload 로 올린다.
// → 폰의 SideStore 가 source 피드(/api/ios/source.json)에서 새 버전을 감지해 갱신.
//
// 중요: .ipa 안의 서명은 SideStore 가 폰에서 자기 Apple ID 로 다시 한다 → 여기선 서명 불필요.
//
// 사용:
//   pnpm ipa:build                 # 최신 Release .app 찾아 패키징 + 업로드
//   pnpm ipa:build --no-upload     # .ipa 만 만들고 끝(packages/app/dist-ipa/ 에 저장)
//   pnpm ipa:build --app <경로>    # 사용할 .app 을 직접 지정
//
// 접속값은 env 우선, 없으면 packages/app/.env 의 EXPO_PUBLIC_NAVIS_URL/TOKEN 을 읽는다
// (notify-navis.mjs 와 동일 규약. navis 의 APP_API_TOKEN == EXPO_PUBLIC_NAVIS_TOKEN).
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(ROOT, "packages/app");

function envFile(key) {
  try {
    const txt = readFileSync(join(APP_DIR, ".env"), "utf8");
    const m = txt.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const args = process.argv.slice(2);
const noUpload = args.includes("--no-upload");
const appFlag = args.indexOf("--app");
const explicitApp = appFlag >= 0 ? args[appFlag + 1] : undefined;

// 1) 버전 — app.json 의 expo.version 을 .ipa 파일명/피드 버전으로 쓴다.
const appJson = JSON.parse(readFileSync(join(APP_DIR, "app.json"), "utf8"));
const version = appJson?.expo?.version;
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[ipa] app.json 의 expo.version 이 X.Y.Z 형식이 아님: ${version}`);
  process.exit(1);
}

// 2) Release .app 찾기 — DerivedData 의 Release-iphoneos 최상위 *.app 중 가장 최근 것.
function findLatestApp() {
  if (explicitApp) {
    if (!existsSync(explicitApp)) {
      console.error(`[ipa] --app 경로가 없음: ${explicitApp}`);
      process.exit(1);
    }
    return explicitApp;
  }
  const dd = join(homedir(), "Library/Developer/Xcode/DerivedData");
  if (!existsSync(dd)) {
    console.error(`[ipa] DerivedData 가 없음: ${dd} — 먼저 Release 빌드를 해줘.`);
    process.exit(1);
  }
  const found = [];
  for (const proj of readdirSync(dd)) {
    const rel = join(dd, proj, "Build/Products/Release-iphoneos");
    if (!existsSync(rel)) continue;
    for (const entry of readdirSync(rel)) {
      if (entry.endsWith(".app")) {
        const p = join(rel, entry);
        try {
          found.push({ path: p, mtime: statSync(p).mtimeMs });
        } catch {
          /* skip */
        }
      }
    }
  }
  if (!found.length) {
    console.error(
      "[ipa] Release-iphoneos/*.app 을 못 찾음.\n" +
        "      먼저 빌드: cd packages/app && npx expo run:ios --device <UDID> --configuration Release",
    );
    process.exit(1);
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0].path;
}

const appPath = findLatestApp();
console.log(`[ipa] .app  = ${appPath}`);
console.log(`[ipa] 버전  = ${version}`);

// 3) Payload/ 로 감싸 .ipa zip 생성.
const outDir = join(APP_DIR, "dist-ipa");
const ipaName = `navis-${version}.ipa`;
const ipaPath = join(outDir, ipaName);
const work = join(outDir, ".work");

mkdirSync(outDir, { recursive: true });
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "Payload"), { recursive: true });
cpSync(appPath, join(work, "Payload", basename(appPath)), { recursive: true });
rmSync(ipaPath, { force: true });
// -y: 심볼릭 링크 보존(프레임워크 내부 링크가 깨지면 SideStore 설치 실패).
execFileSync("zip", ["-qry", ipaPath, "Payload"], { cwd: work, stdio: "inherit" });
rmSync(work, { recursive: true, force: true });

const size = statSync(ipaPath).size;
console.log(`[ipa] 생성  = ${ipaPath} (${(size / 1048576).toFixed(1)} MB)`);

if (noUpload) {
  console.log("[ipa] --no-upload → 업로드 생략. 위 .ipa 를 직접 SideStore 에 넣으면 됨.");
  process.exit(0);
}

// 4) navis 로 업로드(.ipa + 아이콘).
const navisURL = (
  process.env.NAVIS_URL ||
  process.env.EXPO_PUBLIC_NAVIS_URL ||
  envFile("EXPO_PUBLIC_NAVIS_URL")
).replace(/\/+$/, "");
const token =
  process.env.NAVIS_TOKEN || process.env.EXPO_PUBLIC_NAVIS_TOKEN || envFile("EXPO_PUBLIC_NAVIS_TOKEN");

if (!navisURL || !token) {
  console.error(
    "[ipa] NAVIS_URL/TOKEN 을 못 찾음(packages/app/.env 의 EXPO_PUBLIC_NAVIS_URL/TOKEN).\n" +
      `      .ipa 는 만들어졌음: ${ipaPath}`,
  );
  process.exit(1);
}

async function upload(name, buf, contentType) {
  const url = `${navisURL}/api/ios/upload?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    body: buf,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`업로드 실패 ${name}: ${res.status} ${body}`);
  }
  console.log(`[ipa] 업로드 ✓ ${name}`);
}

try {
  await upload(ipaName, readFileSync(ipaPath), "application/octet-stream");
  // 아이콘은 SideStore 목록 표시용(선택). 한 번만 있으면 됨.
  const icon = join(APP_DIR, "assets/navis-logo.png");
  if (existsSync(icon)) await upload("icon.png", readFileSync(icon), "image/png");
  // 옛 버전 .ipa(+디버깅 probe) 정리 — 최신 한 개만 남긴다.
  const pres = await fetch(`${navisURL}/api/ios/prune`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (pres.ok) {
    const j = await pres.json().catch(() => ({}));
    if (j.deleted?.length) console.log(`[ipa] 정리 ✓ 옛 버전 ${j.deleted.length}개 삭제 (${j.deleted.join(", ")})`);
  }
} catch (err) {
  console.error(`[ipa] ${err.message}`);
  process.exit(1);
}

const sourceURL = `${navisURL}/api/ios/source.json?token=${token}`;
console.log("\n✅ 배포 완료.");
console.log("   SideStore 에 추가할 Source URL:");
console.log(`   ${sourceURL}`);
console.log("\n   (이미 추가돼 있으면 SideStore 가 자동 감지 → 'Update' 탭 1회. JS 변경은 eas update 로 자동.)");
