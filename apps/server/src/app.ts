import { Hono } from "hono";
import { health } from "./routes/health";

// Hono 앱 조립. index.ts 와 분리해 테스트에서 app.fetch 를 직접 부를 수 있게 한다.
//
// 라우트는 소비자가 실재하는 것만 만든다:
//   /health          — 헬스체크 (공개)
//   /chat            — SSE 스트리밍 (web BFF, mobile)
//   /chat/cancel     — 진행 중인 턴 중지
//   /memories        — 기억 CRUD
//   /conversations   — 대화방
//   /settings        — 시스템 프롬프트
//   /mcp             — 외부 MCP 클라이언트(Claude Desktop) 전용
export const app = new Hono();

app.route("/health", health);

// TODO: 인증 미들웨어(API_TOKEN Bearer) — /health 제외 전 경로
// TODO: /chat, /memories, /conversations, /settings, /mcp
