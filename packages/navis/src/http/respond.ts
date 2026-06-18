import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";

// 앱(모바일/데스크톱)·외부 도구가 부르는 /api/* 응답 공통 유틸.
// 네이티브 앱은 CORS 무관하지만 데스크톱(Electron/웹뷰) preflight 대비 헤더를 둔다.
export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
} as const;

export const JSON_HEADERS = {
  ...CORS_HEADERS,
  "content-type": "application/json",
} as const;

// CORS preflight 공통 응답.
export function handlePreflight(res: ServerResponse): void {
  res.writeHead(204, CORS_HEADERS);
  res.end();
}

// JSON 한 방 응답.
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

// 요청 본문 누적 상한(10MB). 인증 전 webhook 경로(connectors OAuth 등)도 이 함수를
// 거치므로, 큰 페이로드로 메모리/이벤트루프를 뭉개려는 시도를 끊는다. 초과 시 413 으로
// 즉시 응답하고 Promise 는 reject — 라우터가 별도 처리할 필요 없이 throw 가 전파된다.
export const MAX_BODY_BYTES = 10 * 1024 * 1024;

export function readBody(req: IncomingMessage, res?: ServerResponse): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on("data", (c: Buffer) => {
      if (aborted) return;
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        aborted = true;
        // 413 으로 끊는다. 호출자가 res 를 안 넘기면 헤더는 못 쓰고 reject 만.
        try {
          if (res && !res.headersSent) {
            res.writeHead(413, JSON_HEADERS);
            res.end(JSON.stringify({ error: "payload too large" }));
          }
        } catch {
          /* ignore */
        }
        try {
          req.destroy();
        } catch {
          /* ignore */
        }
        reject(new Error("payload too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!aborted) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (e) => {
      if (!aborted) reject(e);
    });
  });
}

export function safeParse(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

// readBody + safeParse 를 합친 공통 헬퍼. 핸들러 곳곳에서 반복되던
// `safeParse(await readBody(req,res)) ?? {}` 보일러플레이트를 한 군데로 모은다.
//   - 413(페이로드 초과): readBody 가 직접 413 응답 후 reject → throw 가 그대로 위로 전파.
//   - 빈 본문: 기존 동작 보존 — `{}` 로 본다(POST 가 빈 body 로 와도 핸들러의 필드 검증을 타도록).
//   - 본문은 있는데 JSON 파싱 실패: 즉시 400 "invalid json" 응답 후 null 반환.
// 호출 측은 null 일 때 즉시 return 하면 된다.
export async function readJsonBody(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  const raw = await readBody(req, res);
  if (!raw) return {};
  const parsed = safeParse(raw);
  if (!parsed) {
    sendJson(res, 400, { error: "invalid json" });
    return null;
  }
  return parsed;
}

// "Bearer <token>" 헤더를 상수시간 비교로 검증.
export function verifyBearer(token: string, header: string): boolean {
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const a = Buffer.from(match[1]);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// 공통 에러 응답 헬퍼 — http/* 핸들러의 catch 블록을 통일한다.
//  - sendUpstreamError: namory 등 업스트림 의존(프록시) 실패 → 502 "upstream error".
//  - sendInternalError: navis 내부 처리 실패(SDK 호출/스트림 등) → 500 "internal error".
// 둘 다 console.error 로그 + JSON 1회 응답. 이미 헤더가 나간 뒤(SSE 도중 등)면 본문만 생략한다.
export function sendUpstreamError(res: ServerResponse, tag: string, err: unknown): void {
  console.error(tag, err);
  if (!res.headersSent) sendJson(res, 502, { error: "upstream error" });
}

export function sendInternalError(res: ServerResponse, tag: string, err: unknown): void {
  console.error(tag, err);
  if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
}

// 앱 API 인증 가드 — APP_API_TOKEN 설정 + Bearer 일치 검사.
// 통과 못하면 503/401 응답을 직접 쓰고 false 를 반환한다(호출 측은 즉시 return).
export function requireAppAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const token = config.appApiToken;
  if (!token) {
    sendJson(res, 503, { error: "app api not configured" });
    return false;
  }
  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || !verifyBearer(token, auth)) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
}

// 앱 API 핸들러 공통 래퍼 — `requireAppAuth → try { handler } catch { onError(...) }`
// 보일러플레이트를 한 곳에 모은다. 인증 실패 시 requireAppAuth 가 직접 응답을 쓰고
// 핸들러는 호출되지 않는다(기존 동작과 동일). onError 는 기본 sendUpstreamError(502) —
// 내부 처리 실패가 명확한 라우트는 sendInternalError(500) 를 명시적으로 넘긴다.
export async function withAppAuth(
  req: IncomingMessage,
  res: ServerResponse,
  tag: string,
  handler: () => void | Promise<void>,
  onError: (res: ServerResponse, tag: string, err: unknown) => void = sendUpstreamError,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    await handler();
  } catch (err) {
    onError(res, tag, err);
  }
}
