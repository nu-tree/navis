// 테스트 실행 전 환경변수를 읽는다.
//
// 대화방 테스트는 실제 Postgres 를 쓴다 — jsonb 이어붙이기나 `-> -1 ->> 'text'` 가
// 맞는지는 mock 으로 알 수 없다. 그런데 vitest 는 apps/server/.env 를 자동으로 읽지
// 않아서, 그대로 두면 `pnpm test` 에서 그 테스트들이 **조용히 건너뛰어진다**.
// 게이트가 통과했다고 말하면서 실제로는 안 돈 상태가 된다.
//
// 이미 환경에 있으면 그 값이 이긴다 — loadEnvFile 은 기존 값을 덮지 않는다.
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(
    fileURLToPath(new URL("../../apps/server/.env", import.meta.url)),
  );
} catch {
  // .env 가 없는 환경(CI 등)에서는 그냥 진행한다. DB 테스트는 스킵되고,
  // 그 사실이 vitest 출력에 skipped 로 남는다.
}
