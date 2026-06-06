// iOS 사이드로드 배포 — SideStore source 피드를 navis 가 직접 호스팅한다.
//
// 무료 Apple ID(Personal Team) 사이드로드는 서명이 7일마다 만료되고, 새 네이티브
// 빌드를 깔려면 맥 연결이 필요했다. SideStore 를 끼우면:
//   - 폰이 백그라운드에서 자기 Apple ID 로 자동 재서명(7일 만료 해결, 맥 불필요)
//   - source 피드(JSON)에 새 .ipa 가 올라오면 SideStore 가 감지해 OTA 업데이트
// 이 모듈이 그 source 피드 + .ipa 파일을 서빙한다(데스크톱 배포 serve.ts 와 같은 구조).
//
// 파이프라인:
//   1) 맥에서 `pnpm ipa:build` → Release .app 을 .ipa 로 패키징 →
//      PUT /api/ios/upload?name=navis-<버전>.ipa (Bearer 토큰) 로 이 서버에 올린다.
//   2) 파일은 config.iosDir(= Railway 볼륨)에 저장된다.
//   3) 폰의 SideStore 가 GET /api/ios/source.json?token=… 를 폴링 → 최신 .ipa 감지 →
//      GET /api/ios/file/navis-<버전>.ipa?token=… 로 받아 자기 서명으로 설치/갱신.
//
// 인증은 navis 의 기존 APP_API_TOKEN(config.appApiToken)을 그대로 재사용한다.
// SideStore 는 커스텀 헤더를 못 보내므로 source/파일 URL 에 ?token= 쿼리로 토큰을 박는다
// (피드 JSON 안의 downloadURL 도 같은 토큰을 포함해 발급).
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";

const DIR = resolve(config.iosDir);
const BUNDLE_ID = "com.knu9910.navis";

const MIME: Record<string, string> = {
  ".ipa": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
};

// 토큰 상수시간 비교. 헤더(Bearer) 우선, 없으면 쿼리(?token=).
function authed(req: IncomingMessage, url: URL): boolean {
  const token = config.appApiToken;
  if (!token) return false;
  const header = req.headers["authorization"];
  let given: string | undefined;
  if (typeof header === "string") {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) given = m[1];
  }
  if (!given) given = url.searchParams.get("token") ?? undefined;
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// 파일명에서 시맨틱 버전(X.Y.Z) 추출. 없으면 undefined.
function parseVersion(name: string): string | undefined {
  return name.match(/\d+\.\d+\.\d+/)?.[0];
}

function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// 경로 탈출 방지: basename 만 취하고 DIR 안으로 resolve 되는지 재확인.
function safePath(name: string): string | undefined {
  const base = basename(name);
  if (!base || base === "." || base === "..") return undefined;
  const full = resolve(DIR, base);
  if (full !== join(DIR, base)) return undefined;
  return full;
}

// 요청에서 자기 공개 origin 을 추론(피드 안 downloadURL 절대경로 만들 때 사용).
// Railway 는 x-forwarded-proto/host 를 세팅한다. 로컬(localhost)만 http 로 떨어진다.
function originOf(req: IncomingMessage): string {
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

// 보관 중 .ipa 중 가장 높은 버전 하나의 메타데이터.
async function latestIpa(): Promise<{ name: string; version: string; size: number; mtime: Date } | undefined> {
  const names = await readdir(DIR).catch(() => [] as string[]);
  let best: { name: string; version: string; size: number; mtime: Date } | undefined;
  for (const n of names) {
    if (!n.toLowerCase().endsWith(".ipa")) continue;
    const v = parseVersion(n);
    if (!v) continue;
    if (best && compareVersion(v, best.version) <= 0) continue;
    try {
      const s = await stat(join(DIR, n));
      if (s.isFile()) best = { name: n, version: v, size: s.size, mtime: s.mtime };
    } catch {
      /* skip */
    }
  }
  return best;
}

// PUT/POST /api/ios/upload?name=<파일> — 맥의 빌드 스크립트가 .ipa/아이콘을 올린다.
export async function handleIosUpload(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (!config.appApiToken) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "ios dist not configured" }));
    return;
  }
  if (!authed(req, url)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const name = url.searchParams.get("name");
  const dest = name ? safePath(name) : undefined;
  if (!dest) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad or missing ?name" }));
    return;
  }
  try {
    await mkdir(DIR, { recursive: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error(`[ios] 디렉터리 생성 실패 DIR=${DIR}:`, e);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "mkdir failed",
        dir: DIR,
        code: e.code,
        hint: "IOS_DIR 가 쓰기 가능한 경로인지 확인. Railway면 그 경로에 볼륨 마운트 필요.",
      }),
    );
    return;
  }
  try {
    await new Promise<void>((ok, fail) => {
      const out = createWriteStream(dest);
      req.pipe(out);
      out.on("finish", () => ok());
      out.on("error", fail);
      req.on("error", fail);
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: basename(dest) }));
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error(`[ios] 쓰기 실패 dest=${dest}:`, e);
    // 부분 기록된 파일을 정리 — 그대로 두면 latestIpa() 가 손상된 .ipa 를 "최신"으로
    // 골라 SideStore 피드에 노출, 폰 설치가 깨진다. 파일이 없거나 삭제 실패해도 무시.
    await unlink(dest).catch(() => {});
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "write failed", code: e.code, message: e.message }));
  }
}

// GET /api/ios/source.json — SideStore source 피드. 최신 .ipa 로부터 동적 생성한다.
//   SideStore 에 추가할 URL: https://<navis>/api/ios/source.json?token=<APP_API_TOKEN>
//   피드 안의 downloadURL/iconURL 도 같은 토큰을 박아 SideStore 가 그대로 다운로드한다.
export async function handleIosSource(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "no-cache",
  };
  if (!authed(req, url)) {
    res.writeHead(401, headers);
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const token = config.appApiToken ?? "";
  const origin = originOf(req);
  const fileURL = (name: string) =>
    `${origin}/api/ios/file/${encodeURIComponent(name)}?token=${encodeURIComponent(token)}`;

  const ipa = await latestIpa();
  // 아이콘이 올라와 있으면 피드에 노출(없어도 SideStore 는 동작).
  const hasIcon = await stat(join(DIR, "icon.png"))
    .then((s) => s.isFile())
    .catch(() => false);

  const apps = ipa
    ? [
        {
          name: "나비스",
          bundleIdentifier: BUNDLE_ID,
          developerName: "knu",
          subtitle: "제2의 뇌 · 에이전트",
          localizedDescription: "나비스 iOS (SideStore 사이드로드 배포)",
          iconURL: hasIcon ? fileURL("icon.png") : undefined,
          tintColor: "6D5CFF",
          category: "productivity",
          // 모던 SideStore 포맷 — 버전 목록.
          versions: [
            {
              version: ipa.version,
              date: ipa.mtime.toISOString(),
              localizedDescription: "나비스 iOS",
              downloadURL: fileURL(ipa.name),
              size: ipa.size,
              minOSVersion: "15.0",
            },
          ],
          // 레거시(구버전 AltStore/SideStore) 호환 — 최상위 단일 버전 필드.
          version: ipa.version,
          versionDate: ipa.mtime.toISOString(),
          versionDescription: "나비스 iOS",
          downloadURL: fileURL(ipa.name),
          size: ipa.size,
        },
      ]
    : [];

  const feed = {
    name: "navis",
    identifier: "com.knu9910.navis.source",
    subtitle: "나비스 iOS 사이드로드 피드",
    apps,
    news: [],
  };
  res.writeHead(200, headers);
  res.end(JSON.stringify(feed, null, 2));
}

// POST /api/ios/prune — 최신 버전 .ipa 한 개만 남기고 옛 버전(+디버깅 probe 등)을 지운다.
// 앱은 하나(com.knu9910.navis)뿐이라 그룹핑 없이 단순히 최고 버전만 보존. icon.png 같은
// 비-.ipa 파일은 손대지 않는다. 업로드 직후 ipa:build 가 호출해 디렉터리를 깔끔히 유지.
export async function handleIosPrune(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (!authed(req, url)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  try {
    const names = await readdir(DIR).catch(() => [] as string[]);
    const ipas = names.filter((n) => n.toLowerCase().endsWith(".ipa") && parseVersion(n));
    if (ipas.length < 2) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ deleted: [] }));
      return;
    }
    const latest = ipas.reduce((a, b) =>
      compareVersion(parseVersion(a) ?? "0.0.0", parseVersion(b) ?? "0.0.0") >= 0 ? a : b,
    );
    const deleted: string[] = [];
    for (const n of ipas) {
      if (n === latest) continue;
      const p = safePath(n);
      if (!p) continue;
      try {
        await unlink(p);
        deleted.push(n);
      } catch (err) {
        console.error(`[ios] prune 삭제 실패 ${n}:`, err);
      }
    }
    if (deleted.length) console.log(`[ios] prune: ${deleted.length}개 삭제 — ${deleted.join(", ")}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ deleted }));
  } catch (err) {
    console.error("[ios] prune 실패:", err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "prune failed" }));
  }
}

// GET /api/ios/file/<name> — .ipa / 아이콘 서빙. SideStore(?token=) 와 브라우저 둘 다 사용.
export async function handleIosFile(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (!authed(req, url)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const name = decodeURIComponent(url.pathname.replace(/^\/api\/ios\/file\//, ""));
  const full = safePath(name);
  if (!full) {
    res.writeHead(400);
    res.end("bad name");
    return;
  }
  let info;
  try {
    info = await stat(full);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = (full.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "content-length": info.size,
    // .ipa 는 SideStore 가 그대로 받게 attachment, 아이콘은 inline.
    "content-disposition": ext === ".ipa" ? `attachment; filename="${basename(full)}"` : "inline",
    "cache-control": "no-cache",
  });
  createReadStream(full).pipe(res);
}
