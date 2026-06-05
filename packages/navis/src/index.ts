import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Client } from "discord.js";
import { config } from "./config.js";
import { askClaude } from "./claude/ask.js";
import { curateTurn } from "./claude/curator.js";
import { collectImagesFromDataUrls } from "./discord/image.js";
import { getReports, recordReport } from "./reports/store.js";
import { fetchCrons } from "./cron/api.js";
import { fetchMemories, patchMemory, deleteMemory } from "./memories/api.js";
import { startDiscord } from "./discord/bot.js";
import { startCronScheduler } from "./cron/scheduler.js";
import { startDigestScheduler } from "./digest.js";
import {
  lookupDispatchChannel,
  clearDispatch,
} from "./self-modify/mcp.js";
import { reviewPullRequest } from "./self-modify/review.js";
import { startCalendarScheduler } from "./google/scheduler.js";
import {
  handleDesktopUpload,
  handleDesktopList,
  handleDesktopFile,
  handleDownloadPage,
} from "./desktop/serve.js";

// 디스코드 게이트웨이 봇 시작 (always-on 워커).
const client = startDiscord();

// 선제적 알림 스케줄러 시작 (namory에서 잡 로드 → node-cron 등록).
void startCronScheduler(client);

// 주간 기억 다이제스트 스케줄러 시작 (최근 기억 요약 → 프로필 자동 갱신 + 보고).
startDigestScheduler(client);

// 캘린더 스케줄러 시작 (다가오는 일정 알림 + 매일 23시 follow-up 정리).
// env 미설정이면 조용히 비활성.
startCalendarScheduler(client);

// Railway 등 호스팅 uptime 체크 + GitHub webhook 수신용 HTTP 서버.
createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.url === "/webhook/github" && req.method === "POST") {
    void handleGithubWebhook(req, res, client);
    return;
  }
  if (req.url === "/api/chat") {
    // 네이티브 앱은 CORS 무관하지만, 추후 데스크톱(Electron/웹뷰) 대비 preflight 허용.
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (req.method === "POST") {
      void handleChat(req, res);
      return;
    }
  }
  // 스트리밍(SSE) 채팅 — 토큰 단위로 응답을 흘려보내 체감 지연을 줄인다(앱 우선 경로).
  if (req.url === "/api/chat/stream") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (req.method === "POST") {
      void handleChatStream(req, res);
      return;
    }
  }
  if (req.url?.startsWith("/api/reports")) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (req.method === "GET") {
      handleReports(req, res);
      return;
    }
    // 외부(개발 머신의 Claude Code 등)가 보고를 주입 → 앱/데스크톱이 알림으로 받음.
    if (req.method === "POST") {
      void handlePostReport(req, res);
      return;
    }
  }
  if (req.url?.startsWith("/api/crons")) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (req.method === "GET") {
      void handleCrons(req, res);
      return;
    }
  }
  if (req.url?.startsWith("/api/memories")) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    void handleMemories(req, res);
    return;
  }
  // 데스크톱 설치파일 배포(다운로드 페이지 + 업로드 + 자동업데이트 피드).
  if (req.url === "/download") {
    handleDownloadPage(res);
    return;
  }
  if (req.url?.startsWith("/api/desktop/")) {
    const durl = new URL(req.url, "http://localhost");
    if (durl.pathname === "/api/desktop/upload" && (req.method === "PUT" || req.method === "POST")) {
      void handleDesktopUpload(req, res, durl);
      return;
    }
    if (durl.pathname === "/api/desktop/list" && req.method === "GET") {
      void handleDesktopList(req, res, durl);
      return;
    }
    if (durl.pathname.startsWith("/api/desktop/file/") && req.method === "GET") {
      void handleDesktopFile(req, res, durl);
      return;
    }
  }
  res.writeHead(404);
  res.end();
}).listen(config.port, "0.0.0.0", () => {
  console.log(
    `[agent] http on :${config.port} (/health, /webhook/github, /api/chat, /api/reports, /api/crons)`,
  );
});

// 앱이 크론 목록을 받아 크론마다 보고방을 미리 만든다(한눈에 보기). 프롬프트 등 민감
// 정보는 제외하고 표시용 필드만 노출.
async function handleCrons(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = config.appApiToken;
  if (!token) {
    res.writeHead(503, JSON_HEADERS);
    res.end(JSON.stringify({ error: "app api not configured" }));
    return;
  }
  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || !verifyBearer(token, auth)) {
    res.writeHead(401, JSON_HEADERS);
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  try {
    const crons = await fetchCrons();
    const safe = crons.map((c) => ({
      id: c.id,
      title: c.title,
      schedule: c.schedule,
      timezone: c.timezone,
      enabled: c.enabled,
      lastRunAt: c.lastRunAt,
    }));
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ crons: safe }));
  } catch (err) {
    console.error("[crons] 조회 실패:", err);
    res.writeHead(502, JSON_HEADERS);
    res.end(JSON.stringify({ error: "upstream error" }));
  }
}

// 앱 기억 페이지 — namory 기억 REST 프록시. GET 목록 / PATCH 수정 / DELETE 삭제.
async function handleMemories(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = config.appApiToken;
  if (!token) {
    res.writeHead(503, JSON_HEADERS);
    res.end(JSON.stringify({ error: "app api not configured" }));
    return;
  }
  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || !verifyBearer(token, auth)) {
    res.writeHead(401, JSON_HEADERS);
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const url = new URL(req.url ?? "/api/memories", "http://localhost");
  const idMatch = url.pathname.match(/^\/api\/memories\/([^/]+)$/);

  try {
    if (req.method === "GET" && url.pathname === "/api/memories") {
      const limit = Number(url.searchParams.get("limit")) || undefined;
      const project = url.searchParams.get("project") ?? undefined;
      const memories = await fetchMemories(limit, project);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ memories }));
      return;
    }
    if (req.method === "PATCH" && idMatch) {
      const raw = await readBody(req);
      const body = (safeParse(raw) ?? {}) as Record<string, unknown>;
      const result = await patchMemory(idMatch[1], body);
      res.writeHead(result.ok ? 200 : result.status, JSON_HEADERS);
      res.end(JSON.stringify({ ok: result.ok }));
      return;
    }
    if (req.method === "DELETE" && idMatch) {
      const result = await deleteMemory(idMatch[1]);
      res.writeHead(result.ok ? 200 : result.status, JSON_HEADERS);
      res.end(JSON.stringify({ ok: result.ok }));
      return;
    }
    res.writeHead(404, JSON_HEADERS);
    res.end(JSON.stringify({ error: "not found" }));
  } catch (err) {
    console.error("[memories] proxy 실패:", err);
    res.writeHead(502, JSON_HEADERS);
    res.end(JSON.stringify({ error: "upstream error" }));
  }
}

// 보고 주입 — 외부에서 한 줄 보고를 넣으면 앱/데스크톱이 폴링해 네이티브 알림으로 띄운다.
// 용도: 개발 머신의 Claude Code 가 작업을 끝내면 "작업 완료" 를 여기로 POST → 맥에서 알림.
// body: { text: string, title?: string, sourceId?: string }
//   sourceId 같으면 같은 방으로 묶인다(기본 "claude-code" → "🤖 작업 보고" 방).
async function handlePostReport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = config.appApiToken;
  if (!token) {
    res.writeHead(503, JSON_HEADERS);
    res.end(JSON.stringify({ error: "app api not configured" }));
    return;
  }
  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || !verifyBearer(token, auth)) {
    res.writeHead(401, JSON_HEADERS);
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const raw = await readBody(req);
  const body = safeParse(raw);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    res.writeHead(400, JSON_HEADERS);
    res.end(JSON.stringify({ error: "text required" }));
    return;
  }
  const sourceId = typeof body?.sourceId === "string" && body.sourceId ? body.sourceId : "claude-code";
  const sourceTitle =
    typeof body?.title === "string" && body.title ? body.title : "🤖 작업 보고";
  recordReport({ type: "claude-code", text, sourceId, sourceTitle });
  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify({ ok: true }));
}

// 앱이 선제 보고를 폴링하는 엔드포인트. ?since=<ISO> 로 증분 조회.
function handleReports(req: IncomingMessage, res: ServerResponse): void {
  const token = config.appApiToken;
  if (!token) {
    res.writeHead(503, JSON_HEADERS);
    res.end(JSON.stringify({ error: "app api not configured" }));
    return;
  }
  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || !verifyBearer(token, auth)) {
    res.writeHead(401, JSON_HEADERS);
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const url = new URL(req.url ?? "/api/reports", "http://localhost");
  const since = url.searchParams.get("since") ?? undefined;
  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify({ reports: getReports(since) }));
}

// navis-app(모바일/데스크톱) 채팅 엔드포인트. 디스코드와 같은 두뇌(askClaude)를 쓰되
// 인증은 APP_API_TOKEN Bearer 토큰으로 한다. 멀티턴은 클라가 보관한 sessionId 로 이어가고,
// 컨텍스트가 한도를 넘으면 contextFull:true 를 돌려 클라가 다음 턴부터 세션을 리셋한다.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
} as const;
const JSON_HEADERS = { ...CORS_HEADERS, "content-type": "application/json" } as const;

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const token = config.appApiToken;
    if (!token) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: "app api not configured" }));
      return;
    }

    const auth = req.headers["authorization"];
    if (typeof auth !== "string" || !verifyBearer(token, auth)) {
      res.writeHead(401, JSON_HEADERS);
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const raw = await readBody(req);
    const body = safeParse(raw);
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    // 첨부 이미지: data URL 배열(`data:<mime>;base64,...`) → InputImage (타입/용량/다운스케일).
    const imageUrls = Array.isArray(body?.images)
      ? (body.images.filter((u) => typeof u === "string") as string[])
      : [];
    const images = imageUrls.length > 0 ? await collectImagesFromDataUrls(imageUrls) : [];

    // 텍스트도 이미지도 없으면 거부(이미지만 보내는 경우는 허용).
    if (!text && images.length === 0) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: "text or image required" }));
      return;
    }
    const resume =
      typeof body?.sessionId === "string" && body.sessionId ? body.sessionId : undefined;

    const result = await askClaude(text, resume, images);
    const contextFull = result.contextTokens >= config.contextTokenLimit;

    res.writeHead(200, JSON_HEADERS);
    res.end(
      JSON.stringify({
        text: result.text,
        sessionId: result.sessionId,
        contextFull,
        // 이 턴에 namory 에 기억을 저장했는지 → 앱이 💡 리액션 표시(디스코드와 동일)
        saved: result.saved,
      }),
    );

    // 사후 큐레이터(A) — 디스코드/CLI 와 동일하게 응답을 보낸 뒤 백그라운드로 한 번 더
    // 평가해 저장 누락을 메운다. 앱 경로에만 이게 빠져 있어 앱으로 대화하면 namory 에
    // 기억이 덜 쌓였다(디스코드 대비 "기억 못함" 체감의 원인). fire-and-forget.
    curateTurn({ userText: text, assistantText: result.text }).catch(() => {
      // 큐레이터 실패는 무시 — 사용자 응답은 이미 끝났다.
    });
  } catch (err) {
    console.error("[chat] 처리 실패:", err);
    if (!res.headersSent) {
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: "internal error" }));
    }
  }
}

// /api/chat 의 스트리밍 버전. 응답 토큰을 SSE 로 흘려보낸다:
//   event: delta  data: {"text":"..."}   ← 토큰 조각 (여러 번)
//   event: done   data: {"sessionId","contextFull","saved"}  ← 종료 + 메타
//   event: error  data: {"error"}         ← 실패
async function handleChatStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = config.appApiToken;
  if (!token) {
    res.writeHead(503, JSON_HEADERS);
    res.end(JSON.stringify({ error: "app api not configured" }));
    return;
  }
  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || !verifyBearer(token, auth)) {
    res.writeHead(401, JSON_HEADERS);
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const raw = await readBody(req);
  const body = safeParse(raw);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const imageUrls = Array.isArray(body?.images)
    ? (body.images.filter((u) => typeof u === "string") as string[])
    : [];
  const images = imageUrls.length > 0 ? await collectImagesFromDataUrls(imageUrls) : [];
  if (!text && images.length === 0) {
    res.writeHead(400, JSON_HEADERS);
    res.end(JSON.stringify({ error: "text or image required" }));
    return;
  }
  const resume =
    typeof body?.sessionId === "string" && body.sessionId ? body.sessionId : undefined;

  // SSE 헤더. 프록시(Railway) 버퍼링 방지 위해 X-Accel-Buffering 도 끈다.
  res.writeHead(200, {
    ...CORS_HEADERS,
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  const sse = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await askClaude(
      text,
      resume,
      images,
      undefined,
      false,
      undefined,
      undefined,
      (delta) => sse("delta", { text: delta }),
    );
    const contextFull = result.contextTokens >= config.contextTokenLimit;
    // 권위 있는 최종 텍스트도 함께 보내 클라가 누적분을 보정하게 한다.
    sse("done", {
      text: result.text,
      sessionId: result.sessionId,
      contextFull,
      saved: result.saved,
    });
    res.end();

    // 사후 큐레이터 — 비스트리밍 경로와 동일하게 저장 누락 보강.
    curateTurn({ userText: text, assistantText: result.text }).catch(() => {});
  } catch (err) {
    console.error("[chat/stream] 처리 실패:", err);
    if (!res.headersSent) {
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: "internal error" }));
    } else {
      sse("error", { error: "internal error" });
      res.end();
    }
  }
}

// "Bearer <token>" 헤더를 상수시간 비교로 검증.
function verifyBearer(token: string, header: string): boolean {
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const a = Buffer.from(match[1]);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function safeParse(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

// GitHub repo Settings → Webhooks 에서 /webhook/github 으로 등록. content type:
// application/json, secret 은 GITHUB_WEBHOOK_SECRET 과 동일 값, 이벤트는 Pull requests 만.
// 받은 페이로드의 HMAC-SHA256 서명을 timingSafeEqual 로 검증한 뒤, opened/reopened 인
// self-improve PR 이면 검토 서브에이전트를 fire-and-forget 으로 spawn.
async function handleGithubWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  client: Client | undefined,
): Promise<void> {
  try {
    const secret = config.githubWebhookSecret;
    if (!secret) {
      console.warn("[webhook] GITHUB_WEBHOOK_SECRET 미설정 — 모든 요청 거부");
      res.writeHead(503);
      res.end("webhook secret not configured");
      return;
    }

    const raw = await readBody(req);
    const signature = req.headers["x-hub-signature-256"];
    if (typeof signature !== "string" || !verifySignature(secret, raw, signature)) {
      res.writeHead(401);
      res.end("invalid signature");
      return;
    }

    // 빠른 ACK — GitHub 은 10초 안에 응답 안 오면 실패로 본다.
    res.writeHead(202);
    res.end("ok");

    const event = req.headers["x-github-event"];
    if (event !== "pull_request") return;

    const payload = JSON.parse(raw) as PullRequestEvent;
    if (payload.action !== "opened" && payload.action !== "reopened") return;

    // self-improve PR 인지 판별: 브랜치 prefix 로 확인 (워크플로에서 `navis/self-improve/*`)
    const head = payload.pull_request.head?.ref ?? "";
    if (!head.startsWith("navis/self-improve/")) return;

    // PR body 에서 dispatch_id / channel_id 메타 파싱
    const body = payload.pull_request.body ?? "";
    const dispatchId = body.match(/dispatch_id:\s*`([^`]+)`/)?.[1];
    const bodyChannelId = body.match(/channel_id:\s*`([^`]+)`/)?.[1];

    // 채널 lookup 우선순위: in-memory 매핑 → PR body 메타 → 포기
    const channelId =
      (dispatchId ? lookupDispatchChannel(dispatchId) : undefined) ?? bodyChannelId;
    if (!channelId) {
      console.warn(`[webhook] PR #${payload.pull_request.number} 채널 lookup 실패 — 검토 스킵`);
      return;
    }
    if (dispatchId) clearDispatch(dispatchId);

    // 원래 작업 지시는 PR body 의 ``` 블록에 박혀있음(워크플로 yaml 참조)
    const instruction =
      body.match(/##\s*작업 지시\s*\n```\n([\s\S]*?)\n```/)?.[1]?.trim() ??
      "(지시 파싱 실패)";

    // 디스코드 비활성이면 PR 검토 보고 경로(채널)가 없으므로 스킵.
    if (!client) return;

    // fire-and-forget — 디스코드 메인 흐름과 독립
    void reviewPullRequest({
      client,
      channelId,
      prNumber: payload.pull_request.number,
      prTitle: payload.pull_request.title,
      prUrl: payload.pull_request.html_url,
      instruction,
    });
  } catch (err) {
    console.error("[webhook] 처리 실패:", err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end("internal error");
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function verifySignature(secret: string, payload: string, signature: string): boolean {
  // signature 형식: "sha256=<hex>"
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface PullRequestEvent {
  action: string;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    head: { ref: string };
  };
}
