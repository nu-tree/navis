import type { IncomingMessage, ServerResponse } from "node:http";
import {
  handleDesktopUpload,
  handleDesktopList,
  handleDesktopLatest,
  handleDesktopFile,
  handleDesktopPrune,
  handleDownloadPage,
} from "../desktop/serve.js";
import { handlePreflight } from "./respond.js";
import { handleChat, handleChatStream, handleChatCancel, handleChatHandoff } from "./chat.js";
import { handleReports, handlePostReport } from "./reports.js";
import { handleCrons, handleDeleteCron } from "./crons.js";
import { handleMemories } from "./memories.js";
import { handleAgentNamory } from "./agent.js";
import {
  handleGetConversations,
  handlePutConversation,
  handleDeleteConversation,
} from "./conversations.js";
import { handleGetSystemPrompt, handlePutSystemPrompt } from "./settings.js";
import {
  handleGetConnectors,
  handlePutConnector,
  handleDeleteConnector,
  handleGetProviders,
  handleOAuthStart,
  handleOAuthCallback,
} from "./connectors.js";
import { handleGithubWebhook } from "./webhook.js";
import { handleIosUpload, handleIosSource, handleIosFile, handleIosPrune } from "../ios/serve.js";

// ── 라우트 테이블 ───────────────────────────────────────────────────────
// 메서드 + 경로 매처 + 핸들러의 배열. route() 가 위→아래로 순회하며 첫 매치를 실행.
// 모든 경로 매칭은 URL.pathname 기준이라 쿼리스트링(`/api/chat?x=1`)이 붙어도 깨지지 않는다.
// 메서드 미스매치는 다음 라우트로 넘어가, 끝까지 미스면 404 폴백(기존 동작 보존).

type Matcher = (pathname: string) => Match;
type Match = { ok: true; id?: string } | { ok: false };
type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  match: { id?: string },
) => void | Promise<void>;

// 정확 일치 — pathname 이 path 와 같을 때만 매치.
const exact =
  (path: string): Matcher =>
  (pathname) =>
    pathname === path ? { ok: true } : { ok: false };

// startsWith — 옛 `req.url?.startsWith(...)` 블록을 그대로 보존하기 위함.
const prefix =
  (p: string): Matcher =>
  (pathname) =>
    pathname.startsWith(p) ? { ok: true } : { ok: false };

// /api/foo/:id 형태 — prefix 로 시작하고 그 뒤에 비어있지 않은 꼬리가 있을 때 매치.
// id 는 decodeURIComponent 로 복원해 핸들러로 넘긴다. 슬래시 포함 여부는 검사하지
// 않는다(기존 동작 보존: 잘못된 형식은 핸들러의 검증 단계에서 4xx 로 거른다).
const param =
  (p: string): Matcher =>
  (pathname) => {
    if (!pathname.startsWith(p)) return { ok: false };
    const id = decodeURIComponent(pathname.slice(p.length));
    if (!id) return { ok: false };
    return { ok: true, id };
  };

// "*" 는 메서드 와일드카드(메모리스 핸들러는 내부에서 GET/PATCH/DELETE 라우팅).
interface Route {
  method: string;
  match: Matcher;
  handler: Handler;
}

const preflight: Handler = (_req, res) => handlePreflight(res);

const routes: Route[] = [
  // /health — JSON 헬스체크. 메서드 무관(기존 동작 보존).
  {
    method: "*",
    match: exact("/health"),
    handler: (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
  },

  // GitHub webhook — POST 만 받는다.
  {
    method: "POST",
    match: exact("/webhook/github"),
    handler: (req, res) => void handleGithubWebhook(req, res),
  },

  // /api/chat — 동기 응답.
  { method: "OPTIONS", match: exact("/api/chat"), handler: preflight },
  { method: "POST", match: exact("/api/chat"), handler: (req, res) => void handleChat(req, res) },

  // /api/chat/stream — SSE 스트리밍.
  { method: "OPTIONS", match: exact("/api/chat/stream"), handler: preflight },
  {
    method: "POST",
    match: exact("/api/chat/stream"),
    handler: (req, res) => void handleChatStream(req, res),
  },

  // /api/chat/cancel — turnId 로 진행 중인 턴을 명시 중지.
  { method: "OPTIONS", match: exact("/api/chat/cancel"), handler: preflight },
  {
    method: "POST",
    match: exact("/api/chat/cancel"),
    handler: (req, res) => void handleChatCancel(req, res),
  },

  // /api/chat/handoff — 백그라운드 완주/푸시 명시 신호.
  { method: "OPTIONS", match: exact("/api/chat/handoff"), handler: preflight },
  {
    method: "POST",
    match: exact("/api/chat/handoff"),
    handler: (req, res) => void handleChatHandoff(req, res),
  },

  // /api/reports — 선제 보고 폴링(GET) / 주입(POST). 기존 동작 보존을 위해 prefix 매치 유지.
  { method: "OPTIONS", match: prefix("/api/reports"), handler: preflight },
  {
    method: "GET",
    match: prefix("/api/reports"),
    handler: (req, res) => handleReports(req, res),
  },
  {
    method: "POST",
    match: prefix("/api/reports"),
    handler: (req, res) => void handlePostReport(req, res),
  },

  // /api/crons — 목록(GET) / 삭제(DELETE :id).
  { method: "OPTIONS", match: prefix("/api/crons"), handler: preflight },
  {
    method: "GET",
    match: exact("/api/crons"),
    handler: (req, res) => void handleCrons(req, res),
  },
  {
    method: "DELETE",
    match: param("/api/crons/"),
    handler: (req, res, _url, m) => void handleDeleteCron(req, res, m.id!),
  },

  // /api/memories — 메서드 라우팅은 핸들러 내부에서. OPTIONS 만 따로 잡고 나머지 위임.
  { method: "OPTIONS", match: prefix("/api/memories"), handler: preflight },
  {
    method: "*",
    match: prefix("/api/memories"),
    handler: (req, res) => void handleMemories(req, res),
  },

  // /api/agent/namory — 데스크톱이 namory MCP 좌표를 받음.
  { method: "OPTIONS", match: prefix("/api/agent/namory"), handler: preflight },
  {
    method: "GET",
    match: prefix("/api/agent/namory"),
    handler: (req, res) => handleAgentNamory(req, res),
  },

  // /api/settings/system-prompt — 시스템 프롬프트 조회/저장.
  { method: "OPTIONS", match: prefix("/api/settings/system-prompt"), handler: preflight },
  {
    method: "GET",
    match: prefix("/api/settings/system-prompt"),
    handler: (req, res) => void handleGetSystemPrompt(req, res),
  },
  {
    method: "PUT",
    match: prefix("/api/settings/system-prompt"),
    handler: (req, res) => void handlePutSystemPrompt(req, res),
  },

  // /api/connectors — OAuth 콜백은 브라우저가 직접 여는 경로라 프리플라이트/인증 없이 먼저 매치.
  {
    method: "GET",
    match: exact("/api/connectors/oauth/callback"),
    handler: (req, res, url) => void handleOAuthCallback(req, res, url),
  },
  { method: "OPTIONS", match: prefix("/api/connectors"), handler: preflight },
  {
    method: "GET",
    match: exact("/api/connectors/providers"),
    handler: (req, res) => void handleGetProviders(req, res),
  },
  {
    method: "POST",
    match: exact("/api/connectors/oauth/start"),
    handler: (req, res) => void handleOAuthStart(req, res),
  },
  {
    method: "GET",
    match: exact("/api/connectors"),
    handler: (req, res) => void handleGetConnectors(req, res),
  },
  {
    method: "PUT",
    match: param("/api/connectors/"),
    handler: (req, res, _url, m) => void handlePutConnector(req, res, m.id!),
  },
  {
    method: "DELETE",
    match: param("/api/connectors/"),
    handler: (req, res, _url, m) => void handleDeleteConnector(req, res, m.id!),
  },

  // /api/conversations — 동기화 프록시.
  { method: "OPTIONS", match: prefix("/api/conversations"), handler: preflight },
  {
    method: "GET",
    match: exact("/api/conversations"),
    handler: (req, res) => void handleGetConversations(req, res),
  },
  {
    method: "PUT",
    match: param("/api/conversations/"),
    handler: (req, res, _url, m) => void handlePutConversation(req, res, m.id!),
  },
  {
    method: "DELETE",
    match: param("/api/conversations/"),
    handler: (req, res, _url, m) => void handleDeleteConversation(req, res, m.id!),
  },

  // /download — 데스크톱 배포 페이지. 메서드 무관(기존 동작 보존).
  { method: "*", match: exact("/download"), handler: (_req, res) => handleDownloadPage(res) },

  // /api/desktop — 데스크톱 배포 API. 데스크톱 렌더러가 authorization 헤더로 호출 → 프리플라이트 필요.
  { method: "OPTIONS", match: prefix("/api/desktop/"), handler: preflight },
  {
    method: "PUT",
    match: exact("/api/desktop/upload"),
    handler: (req, res, url) => void handleDesktopUpload(req, res, url),
  },
  {
    method: "POST",
    match: exact("/api/desktop/upload"),
    handler: (req, res, url) => void handleDesktopUpload(req, res, url),
  },
  {
    method: "GET",
    match: exact("/api/desktop/list"),
    handler: (req, res, url) => void handleDesktopList(req, res, url),
  },
  {
    method: "GET",
    match: exact("/api/desktop/latest"),
    handler: (req, res, url) => void handleDesktopLatest(req, res, url),
  },
  {
    method: "POST",
    match: exact("/api/desktop/prune"),
    handler: (req, res, url) => void handleDesktopPrune(req, res, url),
  },
  {
    method: "GET",
    match: prefix("/api/desktop/file/"),
    handler: (req, res, url) => void handleDesktopFile(req, res, url),
  },

  // /api/ios — 사이드로드 배포. 기존 코드와 동일하게 OPTIONS 핸들러는 두지 않는다(현 동작 보존).
  {
    method: "GET",
    match: exact("/api/ios/source.json"),
    handler: (req, res, url) => void handleIosSource(req, res, url),
  },
  {
    method: "PUT",
    match: exact("/api/ios/upload"),
    handler: (req, res, url) => void handleIosUpload(req, res, url),
  },
  {
    method: "POST",
    match: exact("/api/ios/upload"),
    handler: (req, res, url) => void handleIosUpload(req, res, url),
  },
  {
    method: "POST",
    match: exact("/api/ios/prune"),
    handler: (req, res, url) => void handleIosPrune(req, res, url),
  },
  {
    method: "GET",
    match: prefix("/api/ios/file/"),
    handler: (req, res, url) => void handleIosFile(req, res, url),
  },
];

// HTTP 요청 1건을 적절한 핸들러로 라우팅한다. createServer 콜백에서 호출.
export function route(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  for (const r of routes) {
    if (r.method !== "*" && r.method !== method) continue;
    const m = r.match(url.pathname);
    if (!m.ok) continue;
    r.handler(req, res, url, { id: m.id });
    return;
  }
  res.writeHead(404);
  res.end();
}
