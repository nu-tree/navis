// ── 라우트 테이블 ───────────────────────────────────────────────────────
// 메서드 + 경로 매처 + 핸들러의 배열. dispatch 의 route() 가 위→아래로 순회하며
// 첫 매치를 실행. 메서드 미스매치는 다음 라우트로 넘어가, 끝까지 미스면 404 폴백.
// 등록 순서·매칭 우선순위가 동작에 의미가 있으므로 순서를 그대로 보존한다.

import {
  handleDesktopUpload,
  handleDesktopList,
  handleDesktopLatest,
  handleDesktopFile,
  handleDesktopPrune,
  handleDownloadPage,
} from "../../desktop/serve.js";
import { handlePreflight } from "../respond.js";
import { handleChat, handleChatStream, handleChatCancel, handleChatHandoff } from "../chat.js";
import { handleReports, handlePostReport } from "../reports.js";
import { handleCrons, handleDeleteCron } from "../crons.js";
import { handleMemories } from "../memories.js";
import { handleAgentNamory } from "../agent.js";
import {
  handleGetConversations,
  handlePutConversation,
  handleDeleteConversation,
} from "../conversations.js";
import { handleGetSystemPrompt, handlePutSystemPrompt } from "../settings.js";
import {
  handleGetConnectors,
  handlePutConnector,
  handleDeleteConnector,
  handleGetProviders,
  handleOAuthStart,
  handleOAuthCallback,
} from "../connectors.js";
import { handleGithubWebhook } from "../webhook.js";
import { handleIosUpload, handleIosSource, handleIosFile, handleIosPrune } from "../../ios/serve.js";
import type { Handler, Route } from "./types.js";
import { exact, prefix, param } from "./matchers.js";

const preflight: Handler = (_req, res) => handlePreflight(res);

export const routes: Route[] = [
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
