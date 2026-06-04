// 선제 보고(크론/다이제스트/캘린더) 인메모리 로그. 앱(navis-app)이 /api/reports 로
// 폴링해 보고 전용 방에 표시한다. 재시작 시 사라짐(영속 맥락은 namory 가 담당) —
// 앱은 본 id 로 중복을 거르므로 재시작 후 일부 누락은 허용 범위.
export type Report = {
  id: string;
  type: string; // logTag: "cron" | "calendar" | "digest" | ...
  text: string;
  createdAt: string; // ISO 8601
};

const BUFFER: Report[] = [];
const MAX = 200;
const seq = { n: 0 };

export function recordReport(type: string, text: string): void {
  seq.n += 1;
  BUFFER.push({
    id: `r${Date.now()}-${seq.n}`,
    type,
    text,
    createdAt: new Date().toISOString(),
  });
  if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
}

// since(ISO) 이후 보고만. 없으면 전체.
export function getReports(since?: string): Report[] {
  if (!since) return [...BUFFER];
  return BUFFER.filter((r) => r.createdAt > since);
}
