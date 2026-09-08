// 크론(선제적 알림 스케줄) CRUD — namory 함수 직접 호출.
// 영속화는 namory 가, 스케줄링/전송은 cron/scheduler.ts 가 담당한다.
//
// CronRow 의 lastRunAt 은 문자열로 유지한다 — 앱 응답(/api/crons)과 스케줄러의
// 비교 로직이 문자열 타임스탬프를 전제로 쓰여 있다. DB 의 Date 를 여기서 정규화한다.
import {
  listCrons,
  createCron,
  deleteCron,
  updateCron,
} from "namory";

export interface CronRow {
  id: string;
  title: string;
  schedule: string;
  timezone: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
}

// DB 행 → CronRow. Date|null → ISO 문자열|null.
function toRow(r: {
  id: string;
  title: string;
  schedule: string;
  timezone: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: Date | null;
}): CronRow {
  return {
    id: r.id,
    title: r.title,
    schedule: r.schedule,
    timezone: r.timezone,
    prompt: r.prompt,
    enabled: r.enabled,
    lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
  };
}

export async function fetchCrons(): Promise<CronRow[]> {
  return (await listCrons()).map(toRow);
}

export async function createCronRemote(input: {
  title: string;
  schedule: string;
  prompt: string;
  timezone?: string;
}): Promise<CronRow> {
  const row = await createCron(input);
  if (!row) throw new Error("크론 생성 실패: 생성된 행이 없습니다");
  return toRow(row);
}

export async function deleteCronRemote(id: string): Promise<void> {
  await deleteCron({ id });
}

export async function patchCronRemote(
  id: string,
  patches: { enabled?: boolean; lastRunAt?: string },
): Promise<void> {
  try {
    await updateCron({
      id,
      ...(patches.enabled !== undefined ? { enabled: patches.enabled } : {}),
      ...(patches.lastRunAt ? { lastRunAt: new Date(patches.lastRunAt) } : {}),
    });
  } catch (err) {
    // 실패해도 스케줄러 흐름은 막지 않는다 (로그만).
    console.error(`[cron] lastRunAt 업데이트 실패:`, err);
  }
}
