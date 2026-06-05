import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";

// 앱(모바일/데스크톱)·외부 도구가 부르는 /api/* 응답 공통 유틸.
// 네이티브 앱은 CORS 무관하지만 데스크톱(Electron/웹뷰) preflight 대비 헤더를 둔다.
export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
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

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
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
