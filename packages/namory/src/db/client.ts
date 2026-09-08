import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// ── 서버리스용 Postgres 연결 ─────────────────────────────────────────────────
// 함수 인스턴스는 요청 사이에 얼려졌다 재사용되고, 동시 요청은 각자 별개 인스턴스로
// 뜬다. 인스턴스마다 커넥션 풀을 크게 잡으면 Postgres 쪽 커넥션이 순식간에 고갈되므로
// 반드시 Supabase 풀러(transaction mode, 6543 포트) URL 에 붙이고 풀은 1로 둔다.
//   - prepare: false  — 풀러의 transaction mode 에서는 prepared statement 를 못 쓴다.
//   - max: 1          — 인스턴스당 커넥션 1개. 동시성은 인스턴스 수로 확장된다.
//   - idle_timeout    — 얼려진 인스턴스가 붙잡고 있던 커넥션을 풀러가 회수하게 한다.
//
// 모듈 평가는 콜드스타트마다 한 번 일어나므로 이 파일 스코프의 클라이언트는 자연히
// 인스턴스 단위 싱글턴이다. 다만 개발 중 HMR 은 모듈을 재평가해 커넥션을 누적시키므로
// globalThis 에 캐시해 재사용한다.

const globalRef = globalThis as unknown as {
  __namoryDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL 환경변수가 필요합니다 (Supabase 연결 문자열)");
  }
  const queryClient = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
  });
  return drizzle(queryClient, { schema });
}

export const db = (globalRef.__namoryDb ??= connect());
