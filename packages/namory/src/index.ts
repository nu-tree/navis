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
// 마이그레이션은 여기서 내보내지 않는다. 예전엔 부팅 시 runMigrations + 멱등
// ensureConversationsTable 를 돌렸는데, 그건 컨테이너 배포의 CMD 가
// drizzle-kit(devDependency)을 실행할 수 없어 만든 우회책이었다. 서버리스에는 부팅
// 훅이 아예 없고, 콜드스타트마다 마이그레이션을 돌리면 동시 실행 경쟁 + 지연만 생긴다.
// 이제 스키마 변경은 배포와 분리된 명시적 단계다: `pnpm db:generate` → `pnpm db:migrate`.

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
export {
  getSetting,
  setSetting,
  takeSetting,
  sweepSettingsByPrefix,
} from "./tools/settings.js";

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

// ── 챗 턴 제어 신호 (중지/핸드오프 — 인스턴스 간 전달) ──────────────────
export {
  setTurnSignal,
  hasTurnSignal,
  consumeTurnSignal,
  clearTurnSignals,
  sweepTurnSignals,
  type TurnSignalKind,
} from "./tools/turn-signals.js";

// ── 스케줄 실행권 클레임 (틱 기반 스케줄러용) ───────────────────────────
export { claimCronRun, claimSchedule, type ClaimedCron } from "./tools/schedule.js";

// ── 스키마 / DB ─────────────────────────────────────────────────────────
export { CATEGORIES, type Category } from "./db/schema.js";
export { db } from "./db/client.js";
