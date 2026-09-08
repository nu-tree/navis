// ── namory 라이브러리 진입점 ──────────────────────────────────────────────────
// 예전엔 이 파일이 Fastify 서버였다(listen + /mcp + REST 14개 + 부팅 마이그레이션).
// 그 REST 라우트들은 전부 아래 순수 함수들을 검증·디스패치만 하는 얇은 껍데기였고,
// 유일한 소비자가 별도 서비스로 떠 있던 navis 였다. 둘을 한 배포 단위로 합치면서
// HTTP 홉이 필요 없어졌으므로, namory 는 "함수를 내보내는 라이브러리"가 된다.
//
// 여전히 HTTP 로 남아야 하는 것은 두 개뿐이고, 그건 웹 앱의 라우트가 담당한다:
//   - /mcp    : Claude 커스텀 커넥터·외부 MCP 클라이언트용 (buildMcpServer 사용)
//   - /health : 헬스체크
//
// 서버리스에서는 부팅 훅이 없다(요청마다 인스턴스가 새로 뜨고 응답 후 얼려진다).
// 그래서 예전의 "listen 전에 마이그레이션" 시퀀스는 사라졌다 — runMigrations 는
// 그대로 내보내되, 배포 파이프라인이나 보호된 관리 라우트에서 명시적으로 부른다.
// 콜드스타트마다 마이그레이션을 돌리면 안 된다(동시 실행 경쟁 + 지연).

// ── 기억 도구 (MCP 레지스트리 + 개별 함수) ──────────────────────────────
export { MEMORY_TOOLS, type MemoryTool } from "./tools/registry.js";
export { buildMcpServer } from "./mcp.js";

export { save } from "./tools/save.js";
export { recall } from "./tools/recall.js";
export { recent, listMemories } from "./tools/recent.js";
export { pattern } from "./tools/pattern.js";
export { profileShow, profileUpdate } from "./tools/profile.js";
export { update } from "./tools/update.js";
export { remove } from "./tools/remove.js";
export { todos } from "./tools/todos.js";
export { graphify } from "./tools/graphify.js";

// ── 프로젝트 / 설정 KV ──────────────────────────────────────────────────
export { listProjects } from "./tools/projects.js";
export { getSetting, setSetting } from "./tools/settings.js";

// ── 대화방 동기화 ───────────────────────────────────────────────────────
export {
  listConversations,
  upsertConversation,
  softDeleteConversation,
} from "./tools/conversations.js";

// ── 선제 보고 로그 ─────────────────────────────────────────────────────
export { insertReport, listReports, type ReportRow } from "./tools/reports.js";

// ── 크론 CRUD ───────────────────────────────────────────────────────────
export { listCrons, createCron, deleteCron, updateCron } from "./tools/cron.js";

// ── 스케줄 실행권 클레임 (틱 기반 스케줄러용) ───────────────────────────
export { claimCronRun, claimSchedule, type ClaimedCron } from "./tools/schedule.js";

// ── 스키마 / DB ─────────────────────────────────────────────────────────
export { CATEGORIES, type Category } from "./db/schema.js";
export { db } from "./db/client.js";

// ── 마이그레이션 (배포 파이프라인·관리 라우트에서 명시 호출) ────────────
export { runMigrations } from "./db/migrate.js";
export { ensureConversationsTable } from "./db/ensure.js";
