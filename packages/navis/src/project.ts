import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";

// 작업 디렉터리부터 위로 올라가며 프로젝트명을 감지한다(=navis CLI 자동 태깅용).
// 우선순위:
//   1) .navis 파일(한 줄짜리 프로젝트명) — 명시적 오버라이드. 가장 강함.
//   2) git 레포명 — remote origin URL 의 repo 이름(없으면 레포 루트 폴더명).
//      "레포 단위로 프로젝트 기억을 묶는다"는 의도라, 모노레포에서 하위 패키지의
//      package.json name(navis-app 등)보다 레포명(navis)을 우선한다.
//   3) package.json 의 name — git 이 아닌 일반 노드 프로젝트 폴백.
//   4) (못 찾으면) undefined → 기억은 개인/전역(null)으로 저장.
// pnpm 스크립트로 실행 시엔 INIT_CWD가 진짜 호출 위치를 가리키므로 그쪽을 우선.
export function detectProject(): string | undefined {
  const start = resolve(process.env.INIT_CWD || process.cwd());
  // .navis 는 가장 가까운 것이 최우선(명시적). git/package 보다 먼저 전체 경로를 본다.
  return findNavis(start) ?? findGitRepo(start) ?? findPackageName(start) ?? undefined;
}

// 시작 디렉터리부터 루트까지 올라가며 각 단계에서 predicate 를 적용, 첫 히트를 반환.
function walkUp<T>(startDir: string, pick: (dir: string) => T | undefined): T | undefined {
  let dir = resolve(startDir);
  while (true) {
    const hit = pick(dir);
    if (hit !== undefined) return hit;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// 1) .navis 한 줄짜리 프로젝트명(명시적 오버라이드).
function findNavis(start: string): string | undefined {
  return walkUp(start, (dir) => {
    const f = resolve(dir, ".navis");
    if (!existsSync(f)) return undefined;
    const name = safeRead(f)?.trim().split("\n")[0]?.trim();
    return name || undefined;
  });
}

// 2) git 레포명: .git 을 가진 디렉터리(=레포 루트)를 찾고, remote origin URL 에서
//    repo 이름을 뽑는다. remote 가 없으면 레포 루트 폴더명으로 폴백.
function findGitRepo(start: string): string | undefined {
  return walkUp(start, (dir) => {
    const gitPath = resolve(dir, ".git");
    if (!existsSync(gitPath)) return undefined;
    // .git 은 보통 디렉터리지만 worktree/submodule 에선 "gitdir: ..." 파일일 수 있다.
    // 그 경우 config 파싱은 생략하고 레포 루트 폴더명으로 폴백한다.
    const isDir = (() => {
      try {
        return statSync(gitPath).isDirectory();
      } catch {
        return false;
      }
    })();
    if (isDir) {
      const fromRemote = repoFromGitConfig(resolve(gitPath, "config"));
      if (fromRemote) return fromRemote;
    }
    return basename(dir);
  });
}

// .git/config 의 [remote "origin"] url 에서 repo 이름을 추출.
//   git@github.com:nu-tree/navis.git  → navis
//   https://github.com/nu-tree/navis  → navis
function repoFromGitConfig(configPath: string): string | undefined {
  const txt = safeRead(configPath);
  if (!txt) return undefined;
  // [remote "origin"] 섹션 본문만 떼어낸다(다음 [섹션] 전까지 — 다른 remote url 오인 방지).
  const section = txt.match(/\[remote\s+"origin"\]([^[]*)/)?.[1];
  if (!section) return undefined;
  // 그 안에서 url 라인. 라인 시작 경계로 잡아 'pushurl = ...' 을 'url' 로 오인하지 않는다.
  const url = section.match(/(?:^|\n)\s*url\s*=\s*(.+)/)?.[1]?.trim();
  if (!url) return undefined;
  const last = url
    .replace(/\.git$/, "")
    .split(/[/:]/)
    .filter(Boolean)
    .pop();
  return last || undefined;
}

// 3) package.json name 폴백(@scope/name 이면 마지막 세그먼트만).
function findPackageName(start: string): string | undefined {
  return walkUp(start, (dir) => {
    const pkg = resolve(dir, "package.json");
    if (!existsSync(pkg)) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(pkg, "utf8")) as { name?: unknown };
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        return parsed.name.includes("/") ? basename(parsed.name) : parsed.name;
      }
    } catch {
      // 파싱 실패는 건너뜀 — 더 위로.
    }
    return undefined;
  });
}

function safeRead(p: string): string | undefined {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return undefined;
  }
}
