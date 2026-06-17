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

  // 챗 중지 — 진행 중인 턴 생성을 turnId 로 실제 끊는다(연결 종료와 구분).
  if (req.url === "/api/chat/cancel") {
    if (req.method === "OPTIONS") return handlePreflight(res);
    if (req.method === "POST") return void handleChatCancel(req, res);
  }

  // 챗 핸드오프 — 앱이 백그라운드로 갈 때 진행 중인 턴을 알린다. 서버가 백그라운드
  // 완주 + 영속 + 폰 푸시를 확실히 타게 하는 명시 신호(프록시가 끊김을 가려도 안전).
  if (req.url === "/api/chat/handoff") {
    if (req.method === "OPTIONS") return handlePreflight(res);
    if (req.method === "POST") return void handleChatHandoff(req, res);
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

  // 코드 탭(데스크톱 로컬 에이전트)이 namory 를 직접 MCP 로 붙이게 좌표를 내려줌.
  if (req.url?.startsWith("/api/agent/namory")) {
    if (req.method === "OPTIONS") return handlePreflight(res);
    if (req.method === "GET") return handleAgentNamory(req, res);
  }

  // 설정 — 시스템 프롬프트 조회/저장(앱 설정 화면)
  if (req.url?.startsWith("/api/settings/system-prompt")) {
    if (req.method === "OPTIONS") return handlePreflight(res);
    if (req.method === "GET") return void handleGetSystemPrompt(req, res);
    if (req.method === "PUT") return void handlePutSystemPrompt(req, res);
  }

  // 동적 MCP 커넥터 — 코드 수정 없이 외부 MCP 서버 등록/삭제 + OAuth 연결.
  if (req.url?.startsWith("/api/connectors")) {
    const curl = new URL(req.url, "http://localhost");
    // OAuth 콜백은 제공자가 브라우저로 직접 여는 경로 — 프리플라이트/인증 없이 먼저 처리.
    if (curl.pathname === "/api/connectors/oauth/callback" && req.method === "GET") {
      return void handleOAuthCallback(req, res, curl);
    }
    if (req.method === "OPTIONS") return handlePreflight(res);
    if (curl.pathname === "/api/connectors/providers" && req.method === "GET") {
      return void handleGetProviders(req, res);
    }
    if (curl.pathname === "/api/connectors/oauth/start" && req.method === "POST") {
      return void handleOAuthStart(req, res);
    }
    if (curl.pathname === "/api/connectors" && req.method === "GET") {
      return void handleGetConnectors(req, res);
    }
    if (curl.pathname.startsWith("/api/connectors/")) {
      const id = decodeURIComponent(curl.pathname.slice("/api/connectors/".length));
      if (req.method === "PUT") return void handlePutConnector(req, res, id);
      if (req.method === "DELETE") return void handleDeleteConnector(req, res, id);
    }
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
    // 데스크톱 렌더러(127.0.0.1)에서 authorization 헤더로 호출 → 브라우저 프리플라이트 발생.
    if (req.method === "OPTIONS") return handlePreflight(res);
    if (durl.pathname === "/api/desktop/upload" && (req.method === "PUT" || req.method === "POST")) {
      return void handleDesktopUpload(req, res, durl);
    }
    if (durl.pathname === "/api/desktop/list" && req.method === "GET") {
      return void handleDesktopList(req, res, durl);
    }
    if (durl.pathname === "/api/desktop/latest" && req.method === "GET") {
      return void handleDesktopLatest(req, res, durl);
    }
    if (durl.pathname === "/api/desktop/prune" && req.method === "POST") {
      return void handleDesktopPrune(req, res, durl);
    }
    if (durl.pathname.startsWith("/api/desktop/file/") && req.method === "GET") {
      return void handleDesktopFile(req, res, durl);
    }
  }

  // iOS 사이드로드 배포(SideStore source 피드 + .ipa). 토큰은 Bearer 또는 ?token= 쿼리.
  if (req.url?.startsWith("/api/ios/")) {
    const iurl = new URL(req.url, "http://localhost");
    if (iurl.pathname === "/api/ios/source.json" && req.method === "GET") {
      return void handleIosSource(req, res, iurl);
    }
    if (iurl.pathname === "/api/ios/upload" && (req.method === "PUT" || req.method === "POST")) {
      return void handleIosUpload(req, res, iurl);
    }
    if (iurl.pathname === "/api/ios/prune" && req.method === "POST") {
      return void handleIosPrune(req, res, iurl);
    }
    if (iurl.pathname.startsWith("/api/ios/file/") && req.method === "GET") {
      return void handleIosFile(req, res, iurl);
    }
  }

  res.writeHead(404);
  res.end();
}
