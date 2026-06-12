import { sql } from "drizzle-orm";
import { db } from "./client.js";

// 부팅 시 conversations 테이블을 보장한다(멱등). namory 는 배포 시 마이그레이션을 자동
// 실행하지 않아(Dockerfile CMD = node dist/index.js, drizzle-kit 은 런타임에 없음),
// 새 마이그레이션(0003 conversations)이 프로덕션 DB 에 안 들어가 PUT /conversations 가
// 500 나는 사고가 있었다. 전체 마이그레이터는 과거 db:push 이력 불일치 시 0001 의
// bare ALTER 에서 깨질 위험이 있어, 문제의 표 하나만 IF NOT EXISTS 로 멱등 보장한다.
// 모든 문이 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS 라 표가 없든 컬럼만 빠졌든 안전.
export async function ensureConversationsTable(): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS "conversations" (
    "id" text PRIMARY KEY NOT NULL,
    "title" text NOT NULL,
    "kind" text NOT NULL,
    "messages" jsonb NOT NULL,
    "session_id" text,
    "unread" integer DEFAULT 0 NOT NULL,
    "hidden" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "deleted_at" timestamp with time zone
  )`);
  // 과거 구버전 표(컬럼 누락)도 보정 — 이미 있으면 no-op.
  await db.execute(sql`ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "session_id" text`);
  await db.execute(
    sql`ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "unread" integer DEFAULT 0 NOT NULL`,
  );
  await db.execute(
    sql`ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "hidden" boolean DEFAULT false NOT NULL`,
  );
  await db.execute(
    sql`ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone`,
  );
}
