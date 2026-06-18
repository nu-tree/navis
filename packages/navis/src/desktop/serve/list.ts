// 데스크톱 파일 목록/최신버전 조회 핸들러.
// 다운로드 페이지 렌더(list)와 설치된 앱의 업데이트 폴링(latest)에 쓰인다.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authed, parseVersion, compareVersion } from "../../dist/serve-utils.js";
import { DIR } from "./shared.js";

// GET /api/desktop/list — 토큰 검증 후 보관 중인 파일 목록(JSON). 다운로드 페이지가 렌더용으로 호출.
export async function handleDesktopList(
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
    const files = await Promise.all(
      names.map(async (n) => {
        try {
          const s = await stat(join(DIR, n));
          return s.isFile() ? { name: n, size: s.size } : undefined;
        } catch {
          return undefined;
        }
      }),
    );
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ files: files.filter(Boolean) }));
  } catch (err) {
    console.error("[desktop] 목록 실패:", err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "list failed" }));
  }
}

// GET /api/desktop/latest — 보관 중 설치파일 중 가장 높은 시맨틱 버전을 반환.
//   설치된 앱이 폴링해서 자기 버전보다 높으면 업데이트를 트리거(인앱 배너)하는 용도.
//   가벼운 JSON 한 줄이라 30초 폴링에도 부담 없음. 크로스오리진(데스크톱 렌더러)이라 CORS 허용.
export async function handleDesktopLatest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
  };
  if (!authed(req, url)) {
    res.writeHead(401, headers);
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  try {
    const names = await readdir(DIR).catch(() => [] as string[]);
    let latest: string | undefined;
    for (const n of names) {
      const v = parseVersion(n);
      if (v && (!latest || compareVersion(v, latest) > 0)) latest = v;
    }
    res.writeHead(200, headers);
    res.end(JSON.stringify({ version: latest ?? null }));
  } catch (err) {
    console.error("[desktop] latest 조회 실패:", err);
    res.writeHead(500, headers);
    res.end(JSON.stringify({ error: "latest failed" }));
  }
}
