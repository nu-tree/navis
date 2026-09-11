import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// drizzle-kit 은 이 패키지 안에서 돌기 때문에 apps/server/.env 를 자동으로 읽지 않는다.
// 매번 `DATABASE_URL=... pnpm db:migrate` 를 치게 되므로 여기서 직접 읽는다.
// 이미 환경에 있으면 그 값이 이긴다 — loadEnvFile 은 기존 값을 덮지 않는다.
const envPath = fileURLToPath(new URL("../../apps/server/.env", import.meta.url));
try {
  process.loadEnvFile(envPath);
} catch {
  // .env 가 없어도 진행한다 — CI 처럼 환경변수로 직접 주는 경우가 있다.
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    `DATABASE_URL 이 없다. ${envPath} 를 채우거나 환경변수로 넘길 것.\n` +
      `로컬 개발은 docker compose up -d 후:\n` +
      `  DATABASE_URL=postgresql://navis:navis@127.0.0.1:5432/navis`,
  );
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
});
