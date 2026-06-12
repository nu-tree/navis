import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

// 부팅 시 미적용 마이그레이션을 자동 반영한다. namory 는 그동안 배포 시 마이그레이션을
// 돌리지 않아(Dockerfile CMD=node, drizzle-kit 은 devDep 이라 런타임 부재) 새 마이그레이션이
// 프로덕션 DB 에 누락되는 사고가 있었다(0003 conversations → PUT 500). drizzle-orm 런타임
// 마이그레이터는 prod 의존성이고 migrations 폴더도 이미지에 포함돼 추가 셋업이 필요 없다.
// 적용 이력은 __drizzle_migrations 에 기록돼 이미 반영된 건 건너뛴다(멱등). 이후 추가되는
// 마이그레이션도 배포만 하면 자동 적용된다.
export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경변수가 필요합니다");
  // 마이그레이션 전용 단발 연결(max:1) — DDL 을 순차 적용하고 닫는다. 앱 풀과 분리.
  const client = postgres(url, { prepare: false, max: 1 });
  try {
    // dist/db/migrate.js → ../../migrations = /app/migrations (Dockerfile 이 복사).
    // dev(src/db) 에서도 ../../migrations = packages/namory/migrations 로 동일하게 해석.
    const migrationsFolder = fileURLToPath(new URL("../../migrations", import.meta.url));
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
