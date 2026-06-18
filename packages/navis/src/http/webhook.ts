import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { reviewPullRequest } from "../self-modify/review.js";
import { readBody } from "./respond.js";

// 실제 GitHub webhook 은 pull_request 외의 이벤트 형태로도 도착할 수 있어
// (예: 잘못된 이벤트 헤더 설정), 중첩 필드는 모두 옵셔널로 본다.
interface PullRequestEvent {
  action?: string;
  pull_request?: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    head?: { ref?: string };
  };
}

function verifySignature(secret: string, payload: string, signature: string): boolean {
  // signature 형식: "sha256=<hex>"
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// GitHub repo Settings → Webhooks 에서 /webhook/github 으로 등록. content type:
// application/json, secret 은 GITHUB_WEBHOOK_SECRET 과 동일 값, 이벤트는 Pull requests 만.
// 받은 페이로드의 HMAC-SHA256 서명을 timingSafeEqual 로 검증한 뒤, opened/reopened 인
// self-improve PR 이면 검토 서브에이전트를 fire-and-forget 으로 spawn.
export async function handleGithubWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const secret = config.githubWebhookSecret;
    if (!secret) {
      console.warn("[webhook] GITHUB_WEBHOOK_SECRET 미설정 — 모든 요청 거부");
      res.writeHead(503);
      res.end("webhook secret not configured");
      return;
    }

    const raw = await readBody(req, res);
    const signature = req.headers["x-hub-signature-256"];
    if (typeof signature !== "string" || !verifySignature(secret, raw, signature)) {
      res.writeHead(401);
      res.end("invalid signature");
      return;
    }

    // 파싱은 ACK 이전에 — 실패 시 400 으로 응답해 silent drop 을 막는다.
    // (이전에는 202 ACK 후에 parse 했기 때문에 깨진 payload 가 흔적도 없이 사라졌다.)
    let payload: PullRequestEvent;
    try {
      payload = JSON.parse(raw) as PullRequestEvent;
    } catch (err) {
      console.error("[webhook] JSON parse 실패:", err);
      res.writeHead(400);
      res.end("invalid json");
      return;
    }

    // 빠른 ACK — GitHub 은 10초 안에 응답 안 오면 실패로 본다.
    res.writeHead(202);
    res.end("ok");

    const event = req.headers["x-github-event"];
    if (event !== "pull_request") return;
    if (payload?.action !== "opened" && payload?.action !== "reopened") return;

    // self-improve PR 인지 판별: 브랜치 prefix 로 확인 (워크플로에서 `navis/self-improve/*`)
    // pull_request 가 없는 이벤트 형태도 들어올 수 있어 모든 접근에 옵셔널 체이닝.
    const pr = payload?.pull_request;
    if (!pr) return;
    const head = pr.head?.ref ?? "";
    if (!head.startsWith("navis/self-improve/")) return;

    // 원래 작업 지시는 PR body 의 ``` 블록에 박혀있음(워크플로 yaml 참조).
    // 파싱이 깨지면(템플릿 변경/수동 PR 등) 빈/잘못된 지시로 리뷰 에이전트가 돌아가는 것을
    // 막기 위해 spawn 자체를 건너뛴다 — 잘못된 지시로 토큰을 태우고 엉뚱한 결과를 보고하는
    // 사고를 막는다.
    const body = pr.body ?? "";
    const instruction = body
      .match(/##\s*작업 지시\s*\n```\n([\s\S]*?)\n```/)?.[1]
      ?.trim();
    if (!instruction) {
      console.warn(`[webhook] PR #${pr.number} 의 작업 지시 파싱 실패 — 리뷰 스킵`);
      return;
    }

    // fire-and-forget — 검토 결과는 앱 보고(/api/reports)로 기록된다.
    // reject 시 unhandledRejection 으로 새지 않게 .catch 로 흡수.
    reviewPullRequest({
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.html_url,
      instruction,
    }).catch((e) => console.error("reviewPullRequest failed", e));
  } catch (err) {
    console.error("[webhook] 처리 실패:", err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end("internal error");
    }
  }
}
