// ios/serve.ts·desktop/serve.ts 가 공통으로 쓰는 스트림 업로드 핸들러.
//
// 기존 두 핸들러는 `req.pipe(out)` 를 Promise 로 직접 감쌌는데, 클라이언트가 업로드
// 도중 연결을 끊으면(abort) 'finish'/'error' 가 안정적으로 안 발생해 Promise 가 영영
// resolve 되지 않고(요청 행) 부분 파일이 latest 로 노출되는 위험이 있었다.
// node:stream/promises 의 pipeline() 은 req 의 'aborted' 와 양쪽 'error' 를 모두
// 잡아 반드시 settle 되며, 실패 시 양쪽 스트림을 destroy 한다.
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { basename } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authed, safePath } from "./serve-utils.js";

export interface UploadOpts {
  dir: string; // 보관 디렉터리(이미 resolve 된 절대경로)
  tag: string; // 로그 접두사 — 예: "ios" / "desktop"
  configured: boolean; // 해당 dist 가 활성 상태(예: APP_API_TOKEN 설정 여부)
  notConfiguredError: string; // 503 응답 본문의 error 값
  mkdirHint?: string; // mkdir 실패 시 운영자에게 줄 힌트(예: 볼륨 마운트 안내)
}

export async function handleStreamUpload(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  opts: UploadOpts,
): Promise<void> {
  if (!opts.configured) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: opts.notConfiguredError }));
    return;
  }
  if (!authed(req, url)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const name = url.searchParams.get("name");
  const dest = name ? safePath(opts.dir, name) : undefined;
  if (!dest) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad or missing ?name" }));
    return;
  }
  try {
    await mkdir(opts.dir, { recursive: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error(`[${opts.tag}] 디렉터리 생성 실패 DIR=${opts.dir}:`, e);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "mkdir failed",
        dir: opts.dir,
        code: e.code,
        message: e.message,
        ...(opts.mkdirHint ? { hint: opts.mkdirHint } : {}),
      }),
    );
    return;
  }
  try {
    // pipeline 은 abort/finish/error 어느 쪽이 와도 반드시 settle.
    // req 가 abort 되면 양쪽 스트림을 destroy 해 파일 핸들 누수도 없다.
    await pipeline(req, createWriteStream(dest));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: basename(dest) }));
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error(`[${opts.tag}] 업로드 실패 dest=${dest}:`, e);
    // 부분 파일은 항상 정리한다. abort 든 디스크 에러든, 손상된 .ipa/.dmg/.yml 이
    // 그대로 남으면 latest 조회가 그걸 골라 폰 설치/electron-updater 가 깨진다.
    await unlink(dest).catch(() => {});
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ error: "write failed", code: e.code, message: e.message }),
      );
    } else {
      // 헤더가 이미 나갔다면(드물게) 소켓만 정리.
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
  }
}
