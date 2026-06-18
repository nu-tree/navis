import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchCrons, deleteCronRemote } from "../cron/api.js";
import { unscheduleCron } from "../cron/scheduler.js";
import { sendJson, withAppAuth } from "./respond.js";

// 앱이 크론 목록을 받아 크론마다 보고방을 미리 만든다(한눈에 보기). 프롬프트 등 민감
// 정보는 제외하고 표시용 필드만 노출.
export async function handleCrons(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await withAppAuth(req, res, "[crons] 조회 실패:", async () => {
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
  });
}

// 크론 삭제 — namory(영속)에서 지우고 로컬 스케줄러에서도 즉시 내린다.
// 앱에서 "크론 보고방 나가기" 가 이걸 호출한다.
export async function handleDeleteCron(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  await withAppAuth(req, res, "[crons] 삭제 실패:", async () => {
    if (!id) {
      sendJson(res, 400, { error: "cron id required" });
      return;
    }
    await deleteCronRemote(id); // namory DELETE /crons/:id
    unscheduleCron(id); // 등록된 node-cron 잡 중단(있으면)
    sendJson(res, 200, { ok: true, id });
  });
}
