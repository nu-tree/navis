import { fetchCrons, deleteCronRemote } from "../cron/api.js";
import { json, withAppAuth } from "./respond.js";

// 앱이 크론 목록을 받아 크론마다 보고방을 미리 만든다(한눈에 보기). 프롬프트 등 민감
// 정보는 제외하고 표시용 필드만 노출.
export function handleCrons(req: Request): Promise<Response> {
  return withAppAuth(req, "[crons] 조회 실패:", async () => {
    const crons = await fetchCrons();
    const safe = crons.map((c) => ({
      id: c.id,
      title: c.title,
      schedule: c.schedule,
      timezone: c.timezone,
      enabled: c.enabled,
      lastRunAt: c.lastRunAt,
    }));
    return json(200, { crons: safe });
  });
}

// 크론 삭제. 앱에서 "크론 보고방 나가기" 가 이걸 호출한다.
// 스케줄러에서 따로 내릴 필요가 없다 — 틱이 매번 DB 를 읽으므로 즉시 반영된다.
export function handleDeleteCron(req: Request, id: string): Promise<Response> {
  return withAppAuth(req, "[crons] 삭제 실패:", async () => {
    if (!id) return json(400, { error: "cron id required" });
    await deleteCronRemote(id);
    return json(200, { ok: true, id });
  });
}
