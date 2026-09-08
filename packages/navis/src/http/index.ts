// navis HTTP 핸들러 배럴 — apps/web 의 Route Handler 들이 여기서 가져다 쓴다.
//
// 각 핸들러는 Web 표준 (Request) => Promise<Response> 형태다. 라우팅은 Next.js 의
// 파일 기반 라우터가 하므로, 예전의 자체 라우터(http/router/*)는 삭제됐다.
// 경로별 파라미터(:id)는 Route Handler 가 뽑아 두 번째 인자로 넘긴다.

export { preflight } from "./respond.js";

export {
  handleChat,
  handleChatStream,
  handleChatCancel,
  handleChatHandoff,
} from "./chat.js";

export { handleGetReports, handlePostReport } from "./reports.js";
export { handleCrons, handleDeleteCron } from "./crons.js";
export {
  handleGetMemories,
  handlePatchMemory,
  handleDeleteMemory,
} from "./memories.js";
export {
  handleGetConversations,
  handlePutConversation,
  handleDeleteConversation,
} from "./conversations.js";
export { handleGetSystemPrompt, handlePutSystemPrompt } from "./settings.js";
export {
  handleGetConnectors,
  handlePutConnector,
  handleDeleteConnector,
  handleGetProviders,
  handleOAuthStart,
  handleOAuthCallback,
} from "./connectors.js";
export { handleSchedulerTick } from "./scheduler.js";
