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

// "Bearer <token>" 헤더를 상수시간 비교로 검증.
export function verifyBearer(token: string, header: string): boolean {
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const a = Buffer.from(match[1]);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
