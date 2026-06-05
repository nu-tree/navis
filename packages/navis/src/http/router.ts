import type { IncomingMessage, ServerResponse } from "node:http";
import {
  handleDesktopUpload,
  handleDesktopList,
  handleDesktopFile,
  handleDesktopPrune,
  handleDownloadPage,
} from "../desktop/serve.js";
import { handlePreflight } from "./respond.js";
import { handleChat, handleChatStream } from "./chat.js";
import { handleReports, handlePostReport } from "./reports.js";
import { handleCrons, handleDeleteCron } from "./crons.js";
import { handleMemories } from "./memories.js";
import {
  handleGetConversations,
  handlePutConversation,
  handleDeleteConversation,
} from "./conversations.js";
import { handleGithubWebhook } from "./webhook.js";

// HTTP 요청 1건을 적절한 핸들러로 라우팅한다. createServer 콜백에서 호출.
export function route(req: IncomingMessage, res: ServerResponse): void {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/webhook/github" && req.method === "POST") {
    void handleGithubWebhook(req, res);
    return;
  }

  if (req.url === "/api/chat") {
    if (req.method === "OPTIONS") return handlePreflight(res);
    if (req.method === "POST") return void handleChat(req, res);
  }

  // 스트리밍(SSE) 채팅 — 토큰 단위로 응답을 흘려보내 체감 지연을 줄인다(앱 우선 경로).
  if (req.url === "/api/chat/stream") {
    if (req.method === "OPTIONS") return handlePreflight(res);
    if (req.method === "POST") return void handleChatStream(req, res);
  }

  if (req.url?.startsWith("/api/reports")) {
    if (req.method === "OPTIONS") return handlePreflight(res);
    if (req.method === "GET") return handleReports(req, res);
    // 외부(개발 머신의 Claude Code 등)가 보고를 주입 → 앱/데스크톱이 알림으로 받음.
    if (req.method === "POST") return void handlePostReport(req, res);
  }

  if (req.url?.startsWith("/api/crons")) {
    if (req.method === "OPTIONS") return handlePreflight(res);
    const curl = new URL(req.url, "http://localhost");
    if (req.method === "GET" && curl.pathname === "/api/crons") {
      return void handleCrons(req, res);
    }
    // DELETE /api/crons/:id — 크론 삭제(앱 "크론 보고방 나가기")
    if (req.method === "DELETE" && curl.pathname.startsWith("/api/crons/")) {
      const id = decodeURIComponent(curl.pathname.slice("/api/crons/".length));
      return void handleDeleteCron(req, res, id);
    }
  }

  if (req.url?.startsWith("/api/memories")) {
    if (req.method === "OPTIONS") return handlePreflight(res);
    return void handleMemories(req, res);
  }

  // 대화 동기화 — GET(pull 전체) / PUT(방 upsert) / DELETE(툼스톤)
  if (req.url?.startsWith("/api/conversations")) {
    if (req.method === "OPTIONS") return handlePreflight(res);
    const curl = new URL(req.url, "http://localhost");
    if (req.method === "GET" && curl.pathname === "/api/conversations") {
      return void handleGetConversations(req, res);
    }
    if (curl.pathname.startsWith("/api/conversations/")) {
      const id = decodeURIComponent(curl.pathname.slice("/api/conversations/".length));
      if (req.method === "PUT") return void handlePutConversation(req, res, id);
      if (req.method === "DELETE") return void handleDeleteConversation(req, res, id);
    }
  }

  // 데스크톱 설치파일 배포(다운로드 페이지 + 업로드 + 자동업데이트 피드).
  if (req.url === "/download") {
    handleDownloadPage(res);
    return;
  }
  if (req.url?.startsWith("/api/desktop/")) {
    const durl = new URL(req.url, "http://localhost");
    if (durl.pathname === "/api/desktop/upload" && (req.method === "PUT" || req.method === "POST")) {
      return void handleDesktopUpload(req, res, durl);
    }
    if (durl.pathname === "/api/desktop/list" && req.method === "GET") {
      return void handleDesktopList(req, res, durl);
    }
    if (durl.pathname === "/api/desktop/prune" && req.method === "POST") {
      return void handleDesktopPrune(req, res, durl);
    }
    if (durl.pathname.startsWith("/api/desktop/file/") && req.method === "GET") {
      return void handleDesktopFile(req, res, durl);
    }
  }

  res.writeHead(404);
  res.end();
}
