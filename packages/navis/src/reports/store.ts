// 선제 보고(크론/다이제스트/캘린더) 인메모리 로그. 앱(navis-app)이 /api/reports 로
// 폴링해 보고 전용 방에 표시한다. 재시작 시 사라짐(영속 맥락은 namory 가 담당) —
// 앱은 본 id 로 중복을 거르므로 재시작 후 일부 누락은 허용 범위.
//
// sourceId/sourceTitle 로 "출처별 방"을 만든다. 크론은 크론마다 방 1개(sourceId=크론 id,
// sourceTitle=크론 DB 제목), 다이제스트/캘린더는 각각 고정 방.
import { publishToNtfy } from "./ntfy.js";

export type Report = {
  id: string;
  type: string; // logTag: "cron" | "calendar" | "digest" | ...
  sourceId: string; // 방 라우팅 키 (크론 id / "digest" / "calendar")
  sourceTitle: string; // 방 제목 (DB 기반)
  text: string;
  createdAt: string; // ISO 8601
};

export type RecordReportInput = {
  type: string;
  text: string;
  sourceId: string;
  sourceTitle: string;
};

const BUFFER: Report[] = [];
const MAX = 200;
const seq = { n: 0 };

export function recordReport(input: RecordReportInput): void {
  seq.n += 1;
  BUFFER.push({
    id: `r${Date.now()}-${seq.n}`,
    ...input,
    createdAt: new Date().toISOString(),
  });
  if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
  // 모든 보고를 폰으로 푸시(NTFY_TOPIC 설정 시에만). 데스크톱/웹은 기존 폴링 알림 유지.
  publishToNtfy(input.sourceTitle, input.text);
}

// since(ISO) 이후 보고만. 없으면 전체.
export function getReports(since?: string): Report[] {
  if (!since) return [...BUFFER];
  return BUFFER.filter((r) => r.createdAt > since);
}
