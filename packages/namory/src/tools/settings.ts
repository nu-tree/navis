import { and, eq, like, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";

// 앱에서 편집하는 일반 key→value 설정. 현재는 system_prompt(봇 성격) 보관용.
export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(settings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } });
}

// 키 1개 삭제. 소비 후 즉시 지워야 하는 단기 상태(OAuth pending 등)에 쓴다.
// 삭제된 행이 있었으면 그 값을 돌려준다 — "읽고 지우기"를 한 문장으로 원자적으로
// 처리해, 두 인스턴스가 같은 state 를 동시에 소비하는 걸 막는다.
export async function takeSetting(key: string): Promise<string | undefined> {
  const rows = await db
    .delete(settings)
    .where(eq(settings.key, key))
    .returning({ value: settings.value });
  return rows[0]?.value;
}

// prefix 로 묶인 오래된 단기 상태를 쓸어낸다(TTL 청소). updatedAt 기준.
// prefix 는 코드 상수만 넘길 것 — LIKE 패턴 특수문자(%, _)를 이스케이프하지 않는다.
export async function sweepSettingsByPrefix(
  prefix: string,
  olderThan: Date,
): Promise<number> {
  const rows = await db
    .delete(settings)
    .where(and(like(settings.key, `${prefix}%`), lt(settings.updatedAt, olderThan)))
    .returning({ key: settings.key });
  return rows.length;
}
