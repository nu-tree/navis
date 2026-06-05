import { recordReport } from "./store.js";

// 선제 보고를 앱(/api/reports)용으로 기록한다. 앱/데스크톱이 폴링해 보고 전용 방에
// 표시한다. (선제 보고 = 크론·다이제스트·캘린더·PR검토 등 navis 가 먼저 보내는 메시지.)

// 선제 보고의 출처(앱에서 방 라우팅에 사용). 크론은 크론마다 다르므로 호출부에서 넘긴다.
export type ReportMeta = { sourceId: string; sourceTitle: string };

// logTag 기본 출처 — 다이제스트/캘린더는 고정 방, 그 외는 logTag 기반.
function defaultMeta(logTag: string): ReportMeta {
  if (logTag === "digest") return { sourceId: "digest", sourceTitle: "📋 주간 다이제스트" };
  if (logTag === "calendar") return { sourceId: "calendar", sourceTitle: "📅 캘린더" };
  return { sourceId: logTag, sourceTitle: `🔔 ${logTag}` };
}

// 보고 1건을 기록. meta 를 주면 그 출처(방)로, 없으면 logTag 기본 출처로.
export function emitReport(text: string, logTag = "report", meta?: ReportMeta): void {
  const source = meta ?? defaultMeta(logTag);
  recordReport({ type: logTag, text, sourceId: source.sourceId, sourceTitle: source.sourceTitle });
}
