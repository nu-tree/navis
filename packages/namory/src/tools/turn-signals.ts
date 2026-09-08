import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { turnSignals } from "../db/schema.js";

// 챗 턴 제어 신호(중지/핸드오프). 자세한 배경은 db/schema.ts 의 turnSignals 주석 참조.

export type TurnSignalKind = "cancel" | "handoff";

// 신호를 남긴다(멱등 — 같은 턴에 같은 종류를 두 번 눌러도 한 행).
export async function setTurnSignal(turnId: string, kind: TurnSignalKind): Promise<void> {
  await db
    .insert(turnSignals)
    .values({ turnId, kind })
    .onConflictDoNothing({ target: [turnSignals.turnId, turnSignals.kind] });
}

// 신호가 있는지 확인만 한다(소거 없음). 스트림 폴링이 쓴다.
export async function hasTurnSignal(turnId: string, kind: TurnSignalKind): Promise<boolean> {
  const rows = await db
    .select({ kind: turnSignals.kind })
    .from(turnSignals)
    .where(and(eq(turnSignals.turnId, turnId), eq(turnSignals.kind, kind)))
    .limit(1);
  return rows.length > 0;
}

// 신호를 확인하고 소거한다(1회성). 완료 분기가 쓴다 — DELETE ... RETURNING 이라
// 두 인스턴스가 동시에 불러도 한쪽만 true 를 받는다.
export async function consumeTurnSignal(
  turnId: string,
  kind: TurnSignalKind,
): Promise<boolean> {
  const rows = await db
    .delete(turnSignals)
    .where(and(eq(turnSignals.turnId, turnId), eq(turnSignals.kind, kind)))
    .returning({ kind: turnSignals.kind });
  return rows.length > 0;
}

// 한 턴의 모든 신호 제거(정상 종료 시 정리).
export async function clearTurnSignals(turnId: string): Promise<void> {
  await db.delete(turnSignals).where(eq(turnSignals.turnId, turnId));
}

// 소비되지 않고 남은 오래된 신호 청소. 스케줄러 틱이 부른다.
// 한 턴의 상한(5분)보다 넉넉히 지난 것만 지운다 — 진행 중인 턴의 신호를 지우면 안 된다.
const STALE_MS = 30 * 60_000;

export async function sweepTurnSignals(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS);
  const rows = await db
    .delete(turnSignals)
    .where(lt(turnSignals.createdAt, cutoff))
    .returning({ kind: turnSignals.kind });
  return rows.length;
}
