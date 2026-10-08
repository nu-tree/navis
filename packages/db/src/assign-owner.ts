// 다중 사용자 전환 — 주인 없는 행을 관리자 회원으로 채운다(specs/002 research R4, T021).
//
//   DATABASE_URL=<대상> NAVIS_OWNER_ID=<관리자 uuid> pnpm --filter @navis/db assign-owner
//
// 순서: 0008(user_id 추가, null 허용) → **이 스크립트** → 0009(NOT NULL). 0009 는 null 이 하나라도
// 남아 있으면 실패한다 — 그게 "주인 없는 행 0건"의 보증이다.
//
// 다시 돌려도 안전하다. 이미 주인이 있는 행은 건드리지 않는다.

import { isNull, sql } from "drizzle-orm";
import { db } from "./client";
import { conversations, memories, settings } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const owner = process.env.NAVIS_OWNER_ID?.trim().toLowerCase();
if (!owner || !UUID.test(owner)) {
  console.error("NAVIS_OWNER_ID 가 없거나 uuid 가 아니다(Supabase 대시보드 → Users 의 관리자 UID).");
  process.exit(1);
}

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host;
  } catch {
    return "(알 수 없음)";
  }
})();
console.log(`대상 DB: ${host} · 관리자: ${owner}`);

const result = await db.transaction(async (tx) => {
  const count = async (table: typeof memories | typeof conversations | typeof settings) =>
    Number((await tx.select({ n: sql<number>`count(*)` }).from(table))[0]?.n ?? 0);

  const before = {
    memories: await count(memories),
    conversations: await count(conversations),
    settings: await count(settings),
  };
  const moved = {
    memories: (await tx.update(memories).set({ userId: owner }).where(isNull(memories.userId)).returning({ id: memories.id })).length,
    conversations: (await tx.update(conversations).set({ userId: owner }).where(isNull(conversations.userId)).returning({ id: conversations.id })).length,
    settings: (await tx.update(settings).set({ userId: owner }).where(isNull(settings.userId)).returning({ key: settings.key })).length,
  };
  return { before, moved };
});

for (const table of ["memories", "conversations", "settings"] as const) {
  console.log(`${table}: 전체 ${result.before[table]}건 · 이번에 관리자로 채운 행 ${result.moved[table]}건`);
}
console.log("끝. 이제 0009 마이그레이션(NOT NULL)을 적용한다: pnpm db:migrate");
process.exit(0);
