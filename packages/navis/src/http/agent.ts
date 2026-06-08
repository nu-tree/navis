import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { requireAppAuth, sendJson } from "./respond.js";

// 데스크톱 코드 탭(로컬 에이전트)이 namory 기억을 직접 MCP 로 붙일 수 있도록
// namory MCP 좌표(url/token)를 내려준다. 앱 토큰(requireAppAuth)으로 보호 —
// 단일 사용자 본인 데스크톱만 호출한다. 서버는 namory 좌표를 클라에 직접 박지 않고
// 이 엔드포인트로만 노출해, 좌표가 바뀌어도 서버 한 곳만 고치면 된다.
export function handleAgentNamory(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  if (!requireAppAuth(req, res)) return;
  sendJson(res, 200, {
    url: config.namoryMcpUrl,
    token: config.namoryToken,
  });
}
