import type { IncomingMessage, ServerResponse } from "node:http";
import { getReports, recordReport } from "../reports/store.js";
import { readBody, safeParse, requireAppAuth, sendJson } from "./respond.js";

// 앱이 선제 보고를 폴링하는 엔드포인트. ?since=<ISO> 로 증분 조회.
export function handleReports(req: IncomingMessage, res: ServerResponse): void {
  if (!requireAppAuth(req, res)) return;
  const url = new URL(req.url ?? "/api/reports", "http://localhost");
  const since = url.searchParams.get("since") ?? undefined;
  sendJson(res, 200, { reports: getReports(since) });
}

// 보고 주입 — 외부에서 한 줄 보고를 넣으면 앱/데스크톱이 폴링해 네이티브 알림으로 띄운다.
// 용도: 개발 머신의 Claude Code 가 작업을 끝내면 "작업 완료" 를 여기로 POST → 맥에서 알림.
// body: { text: string, title?: string, sourceId?: string }
//   sourceId 같으면 같은 방으로 묶인다(기본 "claude-code" → "🤖 작업 보고" 방).
export async function handlePostReport(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  const raw = await readBody(req, res);
  const body = safeParse(raw);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    sendJson(res, 400, { error: "text required" });
    return;
  }
  const sourceId =
    typeof body?.sourceId === "string" && body.sourceId ? body.sourceId : "claude-code";
  const sourceTitle =
    typeof body?.title === "string" && body.title ? body.title : "🤖 작업 보고";
  recordReport({ type: "claude-code", text, sourceId, sourceTitle });
  sendJson(res, 200, { ok: true });
}
