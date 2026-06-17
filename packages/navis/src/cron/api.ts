import { namoryFetch } from "../namory-client.js";

// namory의 크론 REST 엔드포인트(/crons) 클라이언트.
// 영속화는 namory가, 스케줄링/전송은 cron/scheduler.ts가 담당한다.
//
// 크론 호출은 namory 측에서 모음 fetch 시 메모리 시리얼라이즈가 길어질 수 있어
// 기본 10초로는 부족할 수 있다 — 호출부에서 25초 타임아웃을 명시적으로 넘긴다.

export interface CronRow {
  id: string;
  title: string;
  schedule: string;
  timezone: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
}

const CRON_TIMEOUT_MS = 25_000;

export async function fetchCrons(): Promise<CronRow[]> {
  const res = await namoryFetch("/crons", undefined, CRON_TIMEOUT_MS);
  if (!res.ok) throw new Error(`크론 조회 실패: ${res.status}`);
  const data = (await res.json()) as { crons?: CronRow[] };
  return data.crons ?? [];
}

export async function createCronRemote(input: {
  title: string;
  schedule: string;
  prompt: string;
  timezone?: string;
}): Promise<CronRow> {
  const res = await namoryFetch(
    "/crons",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    CRON_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`크론 생성 실패: ${res.status} ${await res.text()}`);
  return (await res.json()) as CronRow;
}

export async function deleteCronRemote(id: string): Promise<void> {
  const res = await namoryFetch(
    `/crons/${id}`,
    { method: "DELETE" },
    CRON_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`크론 삭제 실패: ${res.status}`);
}

export async function patchCronRemote(
  id: string,
  patches: { enabled?: boolean; lastRunAt?: string },
): Promise<void> {
  const res = await namoryFetch(
    `/crons/${id}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patches),
    },
    CRON_TIMEOUT_MS,
  );
  // 실패해도 스케줄러 흐름은 막지 않는다 (로그만).
  if (!res.ok)
    console.error(`[cron] lastRunAt 업데이트 실패: ${res.status}`);
}
