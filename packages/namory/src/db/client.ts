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
// ★ 연결은 반드시 "첫 쿼리 시점"에 만든다(모듈 로드 시점이 아니라).
// Next.js 는 빌드 중에 라우트 모듈을 import 해 메타데이터를 수집한다. 모듈 최상단에서
// DATABASE_URL 을 요구하면 그 단계에서 빌드가 깨진다 — 빌드 머신에 DB 자격이 있어야
// 할 이유가 없는데도. 런타임에도 같은 이유로 lazy 가 맞다: import 만으로 커넥션을
// 열어두면 DB 를 안 쓰는 요청(/api/health 등)까지 커넥션을 잡는다.
//
// 개발 중 HMR 은 모듈을 재평가해 커넥션을 누적시키므로 globalThis 에 캐시해 재사용한다.

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalRef = globalThis as unknown as { __namoryDb?: Db };

function connect(): Db {
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

function getDb(): Db {
  return (globalRef.__namoryDb ??= connect());
}

// 호출부는 `db.select()...` 처럼 평범한 drizzle 인스턴스로 쓴다. 프록시가 첫 접근에서
// 실제 연결을 만들어, import 시점에는 아무 것도 하지 않게 한다.
export const db = new Proxy({} as Db, {
  get(_t, prop, receiver) {
    const target = getDb();
    const value = Reflect.get(target as object, prop, receiver) as unknown;
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as Db;
