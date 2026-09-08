import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

// ── /api/* 응답 공통 유틸 (Web 표준 Request/Response) ────────────────────────
// 예전에는 Node 의 IncomingMessage/ServerResponse 를 직접 다뤘다(`sendJson(res, ...)`
// 처럼 res 를 변형하는 스타일). Next.js Route Handler 는 Web 표준을 쓰므로 전부
// "Response 를 만들어 돌려주는" 형태로 바꿨다. 부수효과 대신 반환값이라, 핸들러가
// 응답을 두 번 쓰거나(headersSent 검사) 응답 없이 끝나는 실수가 구조적으로 불가능해진다.
//
// 앱 API 계약(경로·상태코드·본문 형태)은 그대로다 — Expo 앱이 아직 이 API 를 쓴다.

// 네이티브 앱은 CORS 무관하지만 브라우저(웹 UI) preflight 대비 헤더를 둔다.
export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

// CORS preflight 공통 응답.
export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// JSON 한 방 응답.
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

// 요청 본문 누적 상한(10MB). 인증 전 경로(connectors OAuth 콜백 등)도 본문을 읽으므로,
// 큰 페이로드로 메모리를 뭉개려는 시도를 끊는다.
export const MAX_BODY_BYTES = 10 * 1024 * 1024;

// 본문 파싱 결과. ok=false 면 그대로 돌려줄 Response 가 담겨 있다.
export type BodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response };

// JSON 본문 읽기 + 파싱.
//   - 10MB 초과            → 413
//   - 빈 본문              → {} (기존 동작 보존: POST 가 빈 body 로 와도 필드 검증을 타게)
//   - 본문 있는데 파싱 실패 → 400 "invalid json"
//
// content-length 로 먼저 걸러 큰 본문을 아예 버퍼링하지 않는다. 헤더가 없거나 거짓일
// 수 있으니 실제로 읽은 바이트도 다시 확인한다.
export async function readJsonBody(req: Request): Promise<BodyResult> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: json(413, { error: "payload too large" }) };
  }
  let raw: string;
  try {
    raw = await req.text();
  } catch (err) {
    console.error("[http] 본문 읽기 실패:", err);
    return { ok: false, response: json(400, { error: "invalid body" }) };
  }
  // content-length 를 못 믿는 경우(chunked 등)에 대한 실측 확인.
  if (raw.length > MAX_BODY_BYTES) {
    return { ok: false, response: json(413, { error: "payload too large" }) };
  }
  if (!raw) return { ok: true, body: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: json(400, { error: "invalid json" }) };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: json(400, { error: "invalid json" }) };
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

// 공통 에러 응답 — http/* 핸들러의 catch 블록을 통일한다.
//  - upstreamError: 외부 의존(구글·제3자 MCP 등) 실패 → 502
//  - internalError: navis 내부 처리 실패(SDK 호출/DB 등) → 500
export function upstreamError(tag: string, err: unknown): Response {
  console.error(tag, err);
  return json(502, { error: "upstream error" });
}

export function internalError(tag: string, err: unknown): Response {
  console.error(tag, err);
  return json(500, { error: "internal error" });
}

// 앱 API 인증 검사. 통과하면 undefined, 실패하면 그대로 돌려줄 Response.
export function checkAppAuth(req: Request): Response | undefined {
  const token = config.appApiToken;
  if (!token) return json(503, { error: "app api not configured" });
  const auth = req.headers.get("authorization");
  if (!auth || !verifyBearer(token, auth)) return json(401, { error: "unauthorized" });
  return undefined;
}

// 앱 API 핸들러 공통 래퍼 — 인증 → try/catch 보일러플레이트를 한 곳에 모은다.
// onError 기본값은 upstreamError(502); 내부 실패가 명확한 라우트는 internalError 를 넘긴다.
export async function withAppAuth(
  req: Request,
  tag: string,
  handler: () => Promise<Response> | Response,
  onError: (tag: string, err: unknown) => Response = upstreamError,
): Promise<Response> {
  const denied = checkAppAuth(req);
  if (denied) return denied;
  try {
    return await handler();
  } catch (err) {
    return onError(tag, err);
  }
}
