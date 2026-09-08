// 선제 보고(크론/다이제스트/캘린더) 로그. 앱(navis-app)이 /api/reports 로 폴링해
// 보고 전용 방에 표시한다. 저장은 namory 의 reports 테이블.
//
// ── 왜 이렇게 얇아졌나 ───────────────────────────────────────────────────────
// 예전 구현은 220줄이었다: 인메모리 BUFFER + 1초 디바운스 저장 + 저장 직렬화(saving/
// dirty/inflight) + settings KV 블롭 read-modify-write + 하위호환 파서 + SIGTERM/SIGINT
// flush 핸들러. 그 전부가 "프로세스가 오래 살아 있다"는 전제 위에 서 있었고, 서버리스에는
// 그 전제가 없다:
//   - 인스턴스마다 BUFFER 가 따로다 → 크론이 쓴 보고가 앱 폴링을 받는 인스턴스에서 안 보임.
//   - 응답 직후 인스턴스가 얼려진다 → 디바운스 타이머가 발화하지 않아 보고가 유실.
//   - SIGTERM 이 오지 않는다 → flush 핸들러가 영영 안 돈다.
//   - 블롭 read-modify-write → 동시에 발동한 크론 둘이 서로를 덮어쓴다.
// 테이블로 옮기면 이 기계장치가 전부 필요 없어진다. 삽입은 한 번의 INSERT 로 원자적이고,
// 조회는 인덱스 한 개로 커버된다. 캡(예전 MAX=200)도 조회 LIMIT 으로 자연히 해결된다.
//
// sourceId/sourceTitle 로 "출처별 방"을 만든다. 크론은 크론마다 방 1개(sourceId=크론 id,
// sourceTitle=크론 DB 제목), 다이제스트/캘린더는 각각 고정 방.

import { insertReport, listReports } from "namory";
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

// 보고 1건 기록 + 폰 푸시. DB 삽입을 await 한다 — 예전처럼 fire-and-forget 하면
// 서버리스에서 응답 후 인스턴스가 얼려져 삽입이 완료되지 않을 수 있다.
export async function recordReport(input: RecordReportInput): Promise<void> {
  try {
    await insertReport(input);
  } catch (err) {
    // 보고 기록 실패가 호출부(크론 실행 등)를 죽이지는 않게 — 로그만 남긴다.
    console.error("[reports] 저장 실패:", err);
  }
  // 모든 보고를 폰으로 푸시(NTFY_TOPIC 설정 시에만).
  publishToNtfy(input.sourceTitle, input.text);
}

// since(ISO) 이후 보고만. 없으면 최근 것들.
export async function getReports(since?: string): Promise<Report[]> {
  // 잘못된 since 문자열이 Invalid Date 로 조용히 전체 조회가 되지 않게 검증한다.
  let sinceDate: Date | undefined;
  if (since) {
    const d = new Date(since);
    if (!Number.isNaN(d.getTime())) sinceDate = d;
  }
  const rows = await listReports(sinceDate);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    sourceId: r.sourceId,
    sourceTitle: r.sourceTitle,
    text: r.text,
    createdAt: r.createdAt.toISOString(),
  }));
}
