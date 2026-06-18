// 데스크톱 설치파일/latest*.yml 서빙 핸들러.
// 사람(브라우저 ?token=)과 electron-updater(Bearer 헤더) 둘 다 이 엔드포인트를 쓴다.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authed, safePath } from "../../dist/serve-utils.js";
import { DIR, MIME } from "./shared.js";

// GET /api/desktop/file/<name> — 설치파일/latest*.yml 서빙.
export async function handleDesktopFile(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (!authed(req, url)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const name = decodeURIComponent(url.pathname.replace(/^\/api\/desktop\/file\//, ""));
  const full = safePath(DIR, name);
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
  // .yml 은 inline(업데이터가 읽음), 설치파일은 attachment(브라우저 다운로드).
  const disposition = ext === ".yml" ? "inline" : `attachment; filename="${basename(full)}"`;
  res.writeHead(200, {
    "content-type": type,
    "content-length": info.size,
    "content-disposition": disposition,
    "cache-control": "no-cache",
  });
  createReadStream(full).pipe(res);
}
