import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Client } from "discord.js";
import { config } from "./config.js";
import { askClaude } from "./claude/ask.js";
import { startDiscord } from "./discord/bot.js";
import { startCronScheduler } from "./cron/scheduler.js";
import { startDigestScheduler } from "./digest.js";
import {
  lookupDispatchChannel,
  clearDispatch,
} from "./self-modify/mcp.js";
import { reviewPullRequest } from "./self-modify/review.js";
import { startCalendarScheduler } from "./google/scheduler.js";

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
  res.writeHead(404);
  res.end();
}).listen(config.port, "0.0.0.0", () => {
  console.log(`[agent] http on :${config.port} (/health, /webhook/github, /api/chat)`);
});

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
    if (!text) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: "text required" }));
      return;
    }
    const resume =
      typeof body?.sessionId === "string" && body.sessionId ? body.sessionId : undefined;

    const result = await askClaude(text, resume);
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
  } catch (err) {
    console.error("[chat] 처리 실패:", err);
    if (!res.headersSent) {
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: "internal error" }));
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

function safeParse(raw: string): { text?: string; sessionId?: string } | undefined {
  try {
    return JSON.parse(raw) as { text?: string; sessionId?: string };
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
  client: Client,
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
