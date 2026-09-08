import { getReports, recordReport } from "../reports/store.js";
import { internalError, json, readJsonBody, withAppAuth } from "./respond.js";

// 앱이 선제 보고를 폴링하는 엔드포인트. ?since=<ISO> 로 증분 조회.
export function handleGetReports(req: Request): Promise<Response> {
  return withAppAuth(
    req,
    "[reports] 조회 실패:",
    async () => {
      const since = new URL(req.url).searchParams.get("since") ?? undefined;
      return json(200, { reports: await getReports(since) });
    },
    internalError,
  );
}

// 보고 주입 — 외부에서 한 줄 보고를 넣으면 앱이 폴링해 네이티브 알림으로 띄운다.
// 용도: 개발 머신의 Claude Code 가 작업을 끝내면 "작업 완료" 를 여기로 POST → 맥에서 알림.
// body: { text: string, title?: string, sourceId?: string }
//   sourceId 같으면 같은 방으로 묶인다(기본 "claude-code" → "🤖 작업 보고" 방).
export function handlePostReport(req: Request): Promise<Response> {
  return withAppAuth(
    req,
    "[reports] 저장 실패:",
    async () => {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) return parsed.response;
      const b = parsed.body;
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (!text) return json(400, { error: "text required" });
      const sourceId =
        typeof b.sourceId === "string" && b.sourceId ? b.sourceId : "claude-code";
      const sourceTitle = typeof b.title === "string" && b.title ? b.title : "🤖 작업 보고";
      await recordReport({ type: "claude-code", text, sourceId, sourceTitle });
      return json(200, { ok: true });
    },
    internalError,
  );
}
