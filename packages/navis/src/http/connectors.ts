import type { IncomingMessage, ServerResponse } from "node:http";
import {
  requireAppAuth,
  sendJson,
  readBody,
  safeParse,
  CORS_HEADERS,
  sendUpstreamError,
} from "./respond.js";
import {
  listConnectors,
  upsertConnector,
  removeConnector,
  isValidConnectorId,
} from "../connectors/store.js";
import { listProviders, isProviderAvailable } from "../connectors/providers.js";
import { startOAuth, completeOAuth } from "../connectors/oauth.js";
import { config } from "../config.js";
import type { Connector } from "../connectors/types.js";

// 앱 설정 화면용 커넥터 CRUD. 동적 MCP 커넥터를 코드 수정 없이 등록/삭제한다.
//   GET    /api/settings/connectors        → 목록(비밀값 마스킹)
//   PUT    /api/settings/connectors/:id     → 추가/수정(upsert)
//   DELETE /api/settings/connectors/:id     → 삭제

// 응답에서 비밀값(키·토큰)을 마스킹한다 — 설정 여부만 노출하고 원문은 숨긴다.
// needsReauth 는 영구 토큰 실패 후 켜진다(앱 UI 가 "다시 연결" 배지를 띄울 수 있게 노출).
function redact(c: Connector): unknown {
  const a = c.auth;
  const auth =
    a.type === "none"
      ? { type: "none" }
      : a.type === "apikey"
        ? { type: "apikey", header: a.header ?? "Authorization", value: mask(a.value) }
        : {
            type: "oauth",
            token: mask(a.token),
            hasRefreshToken: Boolean(a.refreshToken),
            ...(a.tokenUrl ? { tokenUrl: a.tokenUrl } : {}),
            ...(a.expiresAt ? { expiresAt: a.expiresAt } : {}),
            ...(a.needsReauth ? { needsReauth: true } : {}),
          };
  return { id: c.id, label: c.label, url: c.url, enabled: c.enabled, alwaysLoad: c.alwaysLoad, auth };
}

function mask(s: string): string {
  if (s.length <= 4) return "••••";
  return `${s.slice(0, 2)}••••${s.slice(-2)}`;
}

export async function handleGetConnectors(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const list = await listConnectors();
    sendJson(res, 200, { connectors: list.map(redact) });
  } catch (err) {
    sendUpstreamError(res, "[connectors] 목록 조회 실패:", err);
  }
}

export async function handlePutConnector(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  if (!isValidConnectorId(id)) {
    return sendJson(res, 400, { error: "invalid id (소문자/숫자/_, 예약어 불가)" });
  }
  try {
    const body = safeParse(await readBody(req, res)) ?? {};
    // URL 의 id 가 정본 — body 에 id 가 있어도 덮어쓴다.
    const saved = await upsertConnector({ ...body, id });
    sendJson(res, 200, { connector: redact(saved) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[connectors] 저장 실패:", msg);
    // 형식 오류는 400, 그 외(업스트림)는 502.
    const status = msg.includes("형식 오류") ? 400 : 502;
    sendJson(res, status, { error: msg });
  }
}

export async function handleDeleteConnector(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const ok = await removeConnector(id);
    if (!ok) return sendJson(res, 404, { error: "not found" });
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendUpstreamError(res, "[connectors] 삭제 실패:", err);
  }
}

// ── OAuth 커넥터 ──────────────────────────────────────────────────────

// 앱이 "연결" 화면에 띄울 OAuth 제공자 목록. DCR 로 client_id 를 자동 발급하므로
// 사전 자격 구성이 필요 없다 → 항상 available.
export async function handleGetProviders(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  const providers = listProviders().map((p) => ({
    key: p.key,
    label: p.label,
    available: isProviderAvailable(p),
  }));
  sendJson(res, 200, { providers });
}

// navis 공개 base URL — 콜백 redirect_uri 구성용.
//
// 보안: NAVIS_PUBLIC_URL(config.publicUrl) 이 설정돼 있으면 그 값을 "강제" 사용한다.
// 헤더 기반 폴백은 검증 없이 받는 값이라(x-forwarded-host/Host) Host-header 주입으로
// 공격자 도메인이 redirect_uri 베이스가 될 수 있다 — 프로덕션에선 반드시 NAVIS_PUBLIC_URL
// 을 박아두고, 그 값과 동일한 redirect_uri 를 제공자(노션/구글 등) 에 등록한다.
// 폴백 경로(개발 편의)는 한 번 경고를 찍어 운영 누락이 조용히 묻히지 않게 한다.
let warnedHeaderFallback = false;
function publicBaseUrl(req: IncomingMessage): string {
  if (config.publicUrl) return config.publicUrl;
  if (!warnedHeaderFallback) {
    warnedHeaderFallback = true;
    console.warn(
      "[connectors] NAVIS_PUBLIC_URL 미설정 — redirect_uri 베이스를 요청 헤더에서 추정합니다(Host 주입 노출). 운영에선 반드시 NAVIS_PUBLIC_URL 을 설정하세요.",
    );
  }
  const fwdProto = req.headers["x-forwarded-proto"];
  const proto = (typeof fwdProto === "string" ? fwdProto.split(",")[0] : undefined) ?? "https";
  const fwdHost = req.headers["x-forwarded-host"];
  const host = (typeof fwdHost === "string" ? fwdHost : undefined) ?? req.headers.host ?? "";
  return host ? `${proto}://${host}` : "";
}

// 앱이 authed 로 호출 → (발견+DCR 후) 동의 URL 을 받아 브라우저로 연다. 토큰은 URL 에 싣지 않는다
// (제공자 도메인으로 가는 표준 OAuth 동의 링크라 navis 인증이 필요 없음 — state 가 CSRF 방어).
export async function handleOAuthStart(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const body = safeParse(await readBody(req, res)) ?? {};
    const provider = typeof body.provider === "string" ? body.provider : "";
    if (!provider) return sendJson(res, 400, { error: "provider required" });
    const { authUrl } = await startOAuth(provider, publicBaseUrl(req));
    sendJson(res, 200, { authUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[connectors] OAuth 시작 실패:", msg);
    sendJson(res, 400, { error: msg });
  }
}

// 제공자가 동의 후 code 와 함께 리다이렉트하는 콜백(브라우저가 직접 연다 → HTML 응답).
// state 로 진행 중 인가를 찾으므로 navis 토큰 인증은 불필요.
export async function handleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const provErr = url.searchParams.get("error");
  if (provErr) return sendHtml(res, 400, page("연결 취소됨", `제공자 오류: ${provErr}`));
  if (!code || !state) return sendHtml(res, 400, page("연결 실패", "code/state 누락"));
  try {
    const c = await completeOAuth(code, state);
    sendHtml(res, 200, page("연결 완료 ✓", `${c.label} 가 연결됐어요. 앱으로 돌아가세요.`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[connectors] OAuth 콜백 실패:", msg);
    sendHtml(res, 400, page("연결 실패", msg));
  }
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { ...CORS_HEADERS, "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// 콜백 결과를 보여주는 최소 HTML(브라우저 탭). 자동 닫기 시도 후 안내문 폴백.
// title 과 body 둘 다 함수 내부에서 일관되게 escape — 호출 측이 esc() 를 잊어버려도
// 제공자 응답·예외 메시지에서 흘러들어온 임의 문자열이 그대로 주입되지 않게 한다.
function page(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0b0b10;color:#e8e8ee;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}p{color:#9a9aa8;margin:0}</style>
</head><body><div class="c"><h1>${esc(title)}</h1><p>${esc(body)}</p></div>
<script>setTimeout(function(){try{window.close()}catch(e){}},1500)</script></body></html>`;
}
