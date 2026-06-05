import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchCrons } from "../cron/api.js";
import { requireAppAuth, sendJson } from "./respond.js";

// 앱이 크론 목록을 받아 크론마다 보고방을 미리 만든다(한눈에 보기). 프롬프트 등 민감
// 정보는 제외하고 표시용 필드만 노출.
export async function handleCrons(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const crons = await fetchCrons();
    const safe = crons.map((c) => ({
      id: c.id,
      title: c.title,
      schedule: c.schedule,
      timezone: c.timezone,
      enabled: c.enabled,
      lastRunAt: c.lastRunAt,
    }));
    sendJson(res, 200, { crons: safe });
  } catch (err) {
    console.error("[crons] 조회 실패:", err);
    sendJson(res, 502, { error: "upstream error" });
  }
}
