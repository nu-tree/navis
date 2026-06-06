// dist 배포 서버(ios/serve.ts·desktop/serve.ts)가 공통으로 쓰는 보안 헬퍼.
// 두 서버는 토큰 인증·버전 비교·경로 탈출 방지가 바이트 단위로 동일했는데,
// 한쪽만 고치고 다른 쪽을 빼먹으면 우회 가능한 차이가 생기므로 한 곳에 모았다.
import { basename, join, resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { config } from "../config.js";

// 토큰 상수시간 비교. 헤더(Bearer) 우선, 없으면 쿼리(?token=).
export function authed(req: IncomingMessage, url: URL): boolean {
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
export function parseVersion(name: string): string | undefined {
  return name.match(/\d+\.\d+\.\d+/)?.[0];
}

export function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// 경로 탈출 방지: basename 만 취하고 dir 안으로 resolve 되는지 재확인.
export function safePath(dir: string, name: string): string | undefined {
  const base = basename(name);
  if (!base || base === "." || base === "..") return undefined;
  const full = resolve(dir, base);
  if (full !== join(dir, base)) return undefined;
  return full;
}
