import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { crons, settings } from "../db/schema.js";

// ── 스케줄 실행권 클레임 (원자적) ────────────────────────────────────────────
// 상주 프로세스가 없으니 스케줄러는 외부 트리거가 주기적으로 치는 "틱"이 된다.
// 틱은 겹칠 수 있다(트리거 중복, 앞선 틱이 아직 도는 중, 인스턴스 여러 개). 그래서
// "이 발동을 내가 실행한다"를 DB 한 문장으로 원자적으로 정해야 한다 — 아니면
// 같은 크론이 두 번 돌아 중복 보고 + 이중 토큰 과금이 난다.
//
// 방식: 조건부 UPDATE + RETURNING. "마지막 실행이 이번 발동시각보다 이전일 때만
// 지금으로 갱신하고, 갱신된 행을 돌려준다." 행이 돌아오면 내가 실행권을 얻은 것이고,
// 비면 다른 틱이 이미 가져간 것이다. Postgres 가 행 잠금으로 직렬화해 주므로 별도
// 락 테이블이나 어드바이저리 락이 필요 없다.

export type ClaimedCron = typeof crons.$inferSelect;

// 크론 잡 하나의 실행권을 주장한다. fireTime = 이번에 발동해야 할 예정시각.
// last_run_at 이 fireTime 보다 이전(또는 NULL)일 때만 성공한다.
export async function claimCronRun(
  id: string,
  fireTime: Date,
): Promise<ClaimedCron | undefined> {
  const rows = await db
    .update(crons)
    .set({ lastRunAt: new Date() })
    .where(
      sql`${crons.id} = ${id}
          AND ${crons.enabled} = true
          AND (${crons.lastRunAt} IS NULL OR ${crons.lastRunAt} < ${fireTime})`,
    )
    .returning();
  return rows[0];
}

// 시스템 스케줄(다이제스트·캘린더처럼 DB 행이 없고 코드 상수로 정의된 것)의 실행권.
// settings 테이블 한 칸에 "마지막 실행 시각"을 두고 같은 조건부 갱신을 한다.
//
// 값은 Date#toISOString() 형식으로만 쓴다 — 고정폭 UTC(YYYY-MM-DDTHH:mm:ss.sssZ)라
// 문자열 사전순 비교가 시간순 비교와 일치한다. 이 성질에 기대고 있으니 다른 형식을
// 이 키에 넣지 말 것.
export async function claimSchedule(key: string, fireTime: Date): Promise<boolean> {
  const now = new Date();
  const nowIso = now.toISOString();
  const fireIso = fireTime.toISOString();
  const rows = await db
    .insert(settings)
    .values({ key, value: nowIso, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: nowIso, updatedAt: now },
      // 기존 값(마지막 실행)이 이번 발동시각보다 이전일 때만 갱신 → 그때만 RETURNING 이 행을 준다.
      setWhere: sql`${settings.value} < ${fireIso}`,
    })
    .returning({ key: settings.key });
  return rows.length > 0;
}
