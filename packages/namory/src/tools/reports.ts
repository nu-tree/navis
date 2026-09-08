import { desc, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { reports } from "../db/schema.js";

// 선제 보고 로그 — 삽입 + since 이후 조회. namory 는 저장만 담당하고,
// 발동(스케줄)과 푸시는 navis 가 한다.

export type ReportRow = typeof reports.$inferSelect;

export async function insertReport(input: {
  type: string;
  sourceId: string;
  sourceTitle: string;
  text: string;
}): Promise<ReportRow> {
  const [row] = await db
    .insert(reports)
    .values({
      type: input.type,
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      text: input.text,
    })
    .returning();
  if (!row) throw new Error("보고 저장 실패: 생성된 행이 없습니다");
  return row;
}

// since(Date) 이후 보고만, 시간 오름차순. 없으면 최근 LIMIT 개를 시간순으로.
// 앱은 마지막으로 받은 createdAt 을 since 로 보내며 증분 폴링한다.
const LIMIT = 200;

export async function listReports(since?: Date): Promise<ReportRow[]> {
  if (since) {
    return db
      .select()
      .from(reports)
      .where(gt(reports.createdAt, since))
      .orderBy(reports.createdAt)
      .limit(LIMIT);
  }
  // since 없으면 최신 LIMIT 개 — 그다음 오름차순으로 되돌려 앱이 그대로 렌더하게 한다.
  const rows = await db
    .select()
    .from(reports)
    .orderBy(desc(reports.createdAt))
    .limit(LIMIT);
  return rows.reverse();
}
