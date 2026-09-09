import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ── Postgres 연결 ────────────────────────────────────────────────────────────
// ★ 연결은 "첫 쿼리 시점"에 만든다(모듈 로드 시점이 아니라).
//
// 모듈 최상단에서 DATABASE_URL 을 요구하면 세 곳이 깨진다:
//   - Next 빌드: 라우트 모듈을 import 해 메타데이터를 수집하는 단계에서 죽는다
//     (빌드 머신에 DB 자격이 있어야 할 이유가 없다)
//   - DB 를 안 쓰는 요청(/health)까지 커넥션을 잡는다
//   - 테스트에서 이 모듈을 import 하는 것만으로 DB 가 필요해진다
//
// 개발 중 HMR 은 모듈을 재평가해 커넥션을 누적시키므로 globalThis 에 캐시한다.
//
// Supabase 풀러(transaction mode, 6543)에 붙일 때는 prepare:false 가 필수다.
// max 는 프로세스 하나가 잡을 커넥션 수 — 상주 서버 하나면 넉넉히, 서버리스로
// 옮기면 인스턴스마다 따로 잡으므로 1 로 줄여야 한다.

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalRef = globalThis as unknown as { __navisDb?: Db };

function connect(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL 환경변수가 필요합니다 (Supabase 연결 문자열)");
  }
  return drizzle(
    postgres(url, { prepare: false, max: 10, idle_timeout: 20 }),
    { schema },
  );
}

function getDb(): Db {
  return (globalRef.__navisDb ??= connect());
}

// 호출부는 `db.select()...` 처럼 평범한 drizzle 인스턴스로 쓴다.
// 프록시가 첫 접근에서 실제 연결을 만든다.
export const db = new Proxy({} as Db, {
  get(_t, prop, receiver) {
    const target = getDb();
    const value = Reflect.get(target as object, prop, receiver) as unknown;
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as Db;
