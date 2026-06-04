// 데스크톱 릴리스 원클릭. 버전 올리고 → 커밋 → desktop-v* 태그 → push.
// 태그가 push 되면 GitHub Actions 가 맥/윈도우 빌드 후 navis 로 업로드한다.
//
// 사용법:
//   pnpm release:desktop            # patch 올림 (0.1.0 → 0.1.1)
//   pnpm release:desktop minor      # 0.1.0 → 0.2.0
//   pnpm release:desktop major      # 0.1.0 → 1.0.0
//   pnpm release:desktop 0.5.0      # 명시 버전
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = join(ROOT, "packages/desktop/package.json");

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();
}

const pkg = JSON.parse(readFileSync(PKG, "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);

const arg = process.argv[2] ?? "patch";
let next;
if (arg === "patch") next = `${maj}.${min}.${pat + 1}`;
else if (arg === "minor") next = `${maj}.${min + 1}.0`;
else if (arg === "major") next = `${maj + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else {
  console.error(`[release] 인자가 이상함: "${arg}" (patch|minor|major|x.y.z)`);
  process.exit(1);
}

const tag = `desktop-v${next}`;

// 이미 있는 태그면 중단.
const existing = git("tag", "--list", tag);
if (existing) {
  console.error(`[release] 태그 ${tag} 이미 존재. 버전을 올리거나 태그를 지워라.`);
  process.exit(1);
}

console.log(`[release] ${pkg.version} → ${next}  (태그 ${tag})`);

// 버전 기록 + 그 파일만 스테이징(다른 작업 변경은 건드리지 않음).
pkg.version = next;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n");
git("add", "packages/desktop/package.json");
git("commit", "-m", `release(desktop): v${next}`);
git("tag", tag);

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
console.log(`[release] push ${branch} + ${tag} …`);
git("push", "origin", branch);
git("push", "origin", tag);

console.log(`\n✅ ${tag} 게시. GitHub Actions 가 맥/윈도우 빌드 → navis 업로드 진행 중.`);
console.log(`   진행: https://github.com/nu-tree/navis/actions`);
console.log(`   완료 후: https://navis-production-f09c.up.railway.app/download`);
