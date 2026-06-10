import Fastify from "fastify";
import type { FastifyReply } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./mcp.js";
import { listCrons, createCron, deleteCron, updateCron } from "./tools/cron.js";
import { listMemories } from "./tools/recent.js";
import { listProjects } from "./tools/projects.js";
import {
  listConversations,
  upsertConversation,
  softDeleteConversation,
} from "./tools/conversations.js";
import { getSetting, setSetting } from "./tools/settings.js";
import { update } from "./tools/update.js";
import { remove } from "./tools/remove.js";
import { CATEGORIES, type Category } from "./db/schema.js";

// REST 핸들러 공통 에러 매핑: 도메인 에러 메시지를 HTTP 코드로.
// "해당 id의 ... 없습니다" → 404, "수정할 필드가 없습니다" → 400, 그 외 → 500.
function replyCrudError(reply: FastifyReply, err: unknown, logTag: string) {
  if (err instanceof Error && err.message.startsWith("해당 id의")) {
    // 기존 동작 유지: id 접미사(": <id>")를 떼고 메시지만 반환.
    return reply.code(404).send({ error: err.message.replace(/:.*$/, "") });
  }
  if (err instanceof Error && err.message.startsWith("수정할 필드가 없습니다")) {
    return reply.code(400).send({ error: err.message });
  }
  console.error(`${logTag} 오류:`, err);
  return reply.code(500).send({ error: "서버 오류" });
}

const app = Fastify({
  logger: {
    // 쿼리 토큰(?token=)이 Railway 등 호스팅 로그에 평문으로 남지 않도록 마스킹.
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url.replace(/([?&]token=)[^&]*/i, "$1[REDACTED]"),
          host: request.headers?.host,
          remoteAddress: request.ip,
        };
      },
    },
  },
});

// 헬스체크 (호스팅 uptime 용)
app.get("/health", async () => ({ ok: true }));

// 공개 HTTP 엔드포인트 보호: 단일 시크릿 토큰.
// 별도 auth 모듈/Supabase Auth 불필요 — 단일 사용자라 이 hook 하나면 충분.
// 인증 경로 2가지:
//  1) Authorization: Bearer <토큰>  — 권장 (mcp-remote 등 헤더 가능한 클라이언트)
//  2) ?token=<토큰> 쿼리 파라미터    — Claude 커스텀 커넥터 UI엔 헤더/토큰 입력란이
//     없어 URL에 실어야 함. 토큰은 위 로거에서 마스킹됨.
app.addHook("onRequest", async (req, reply) => {
  // /mcp(도구)·/crons(스케줄)·/memories(기억 CRUD)·/projects·/conversations·/settings 토큰 보호.
  // 그 외(/health)는 공개.
  if (
    !req.url.startsWith("/mcp") &&
    !req.url.startsWith("/crons") &&
    !req.url.startsWith("/memories") &&
    !req.url.startsWith("/projects") &&
    !req.url.startsWith("/conversations") &&
    !req.url.startsWith("/settings")
  )
    return;
  const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const queryToken =
    new URL(req.url, "http://localhost").searchParams.get("token") ?? undefined;
  const token = headerToken || queryToken;
  if (!process.env.NAMORY_TOKEN || token !== process.env.NAMORY_TOKEN) {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

// MCP Streamable HTTP — stateless 모드 (요청마다 새 서버+트랜스포트).
// 단일 사용자·멀티 디바이스·멀티 인스턴스라 세션 친화성이 불필요 → 가장 견고.
app.all("/mcp", async (req, reply) => {
  // 트랜스포트가 reply.raw 에 직접 쓰므로 Fastify 응답 관리를 넘긴다.
  reply.hijack();

  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  reply.raw.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    // Fastify 가 이미 본문을 파싱했으므로 req.body 를 그대로 넘겨 재파싱 방지.
    await transport.handleRequest(req.raw, reply.raw, req.body);
  } catch (err) {
    app.log.error(err);
    if (!reply.raw.headersSent) {
      reply.raw.writeHead(500, { "content-type": "application/json" });
      reply.raw.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "internal error" },
          id: null,
        }),
      );
    }
  }
});

// 사용 중인 프로젝트 목록 — navis가 저장 시 모델에 주입해 표기 통일에 쓴다.
app.get("/projects", async () => ({ projects: await listProjects() }));

// 일반 설정(key→value). 시스템 프롬프트 등을 앱에서 편집/조회.
app.get<{ Params: { key: string } }>("/settings/:key", async (req) => ({
  key: req.params.key,
  value: await getSetting(req.params.key),
}));

app.put<{ Params: { key: string } }>("/settings/:key", async (req, reply) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b.value !== "string") {
    return reply.code(400).send({ error: "value(string) 필요" });
  }
  await setSetting(req.params.key, b.value);
  return { key: req.params.key, ok: true };
});

// 대화방 동기화 — 앱이 기기 간 채팅을 맞춘다. GET(전체 pull)·PUT(방 upsert)·DELETE(툼스톤).
app.get("/conversations", async () => ({ conversations: await listConversations() }));

app.put<{ Params: { id: string } }>("/conversations/:id", async (req, reply) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title : "";
  if (!title) return reply.code(400).send({ error: "title 필요" });
  const row = await upsertConversation({
    id: req.params.id,
    title,
    kind: b.kind === "report" ? "report" : "chat",
    messages: Array.isArray(b.messages) ? b.messages : [],
    sessionId: typeof b.sessionId === "string" ? b.sessionId : null,
    unread: typeof b.unread === "number" ? b.unread : 0,
    hidden: typeof b.hidden === "boolean" ? b.hidden : false,
    updatedAt: typeof b.updatedAt === "string" ? new Date(b.updatedAt) : new Date(),
  });
  // row 가 없으면 LWW 로 더 오래된 쓰기가 무시된 것 — 에러가 아니라 정상(no-op).
  return row ?? { id: req.params.id, skipped: true };
});

app.delete<{ Params: { id: string } }>("/conversations/:id", async (req) => {
  return await softDeleteConversation(req.params.id);
});

// 크론 CRUD (navis 스케줄러/대화 도구가 사용). MCP가 아닌 단순 REST —
// navis가 에이전트 턴 밖(부팅·reconcile)에서도 조회해야 해서 일반 HTTP로 노출.
app.get("/crons", async () => ({ crons: await listCrons() }));

app.post("/crons", async (req, reply) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const schedule = typeof b.schedule === "string" ? b.schedule.trim() : "";
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const timezone = typeof b.timezone === "string" ? b.timezone.trim() : undefined;
  if (!title || !schedule || !prompt) {
    return reply
      .code(400)
      .send({ error: "title, schedule, prompt 가 모두 필요합니다" });
  }
  const row = await createCron({ title, schedule, prompt, timezone });
  return reply.code(201).send(row);
});

app.delete<{ Params: { id: string } }>("/crons/:id", async (req, reply) => {
  try {
    return await deleteCron({ id: req.params.id });
  } catch (err) {
    return replyCrudError(reply, err, "[crons]");
  }
});

app.patch<{ Params: { id: string } }>("/crons/:id", async (req, reply) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patches: { enabled?: boolean; lastRunAt?: Date } = {};
  if (typeof b.enabled === "boolean") patches.enabled = b.enabled;
  if (typeof b.lastRunAt === "string") patches.lastRunAt = new Date(b.lastRunAt);
  if (Object.keys(patches).length === 0) {
    return reply.code(400).send({ error: "enabled 또는 lastRunAt 중 하나 이상 필요" });
  }
  try {
    return await updateCron({ id: req.params.id, ...patches });
  } catch (err) {
    return replyCrudError(reply, err, "[crons]");
  }
});

// 기억 CRUD (앱 기억 페이지가 navis 프록시를 통해 사용). 조회/수정/삭제.
// 수정 시 update() 가 content 변경을 감지해 임베딩을 재계산한다.
app.get("/memories", async (req) => {
  const q = new URL(req.url, "http://localhost").searchParams;
  const limit = Number(q.get("limit")) || undefined;
  const project = q.get("project") ?? undefined;
  return { memories: await listMemories({ limit, project }) };
});

app.patch<{ Params: { id: string } }>("/memories/:id", async (req, reply) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: {
    id: string;
    content?: string;
    category?: Category;
    project?: string;
    tags?: string[];
    done?: boolean;
  } = { id: req.params.id };
  if (typeof b.content === "string") patch.content = b.content;
  if (typeof b.category === "string" && CATEGORIES.includes(b.category as Category)) {
    patch.category = b.category as Category;
  }
  if (typeof b.project === "string") patch.project = b.project;
  if (Array.isArray(b.tags)) patch.tags = b.tags.filter((t): t is string => typeof t === "string");
  if (typeof b.done === "boolean") patch.done = b.done;
  try {
    return await update(patch);
  } catch (err) {
    return replyCrudError(reply, err, "[memories]");
  }
});

app.delete<{ Params: { id: string } }>("/memories/:id", async (req, reply) => {
  try {
    return await remove({ id: req.params.id });
  } catch (err) {
    return replyCrudError(reply, err, "[memories]");
  }
});

const port = Number(process.env.PORT) || 3000;
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`namory listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
