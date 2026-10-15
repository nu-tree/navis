// 회원 목록 — 관리자가 전하기의 받는 사람을 고를 때만 쓴다(specs/004 research R4 · R5).
//
// 회원은 인증 제공자(Supabase)의 auth.users 에 있다. 같은 Postgres 라 server 의 DATABASE_URL 로 읽는다 —
// 새 비밀값(service_role 키)을 들이지 않는다. drizzle 스키마에는 넣지 않는다: 마이그레이션이 남의
// 스키마를 건드리지 않게, 그리고 읽기만 하므로.

import { sql } from "drizzle-orm";
import { db } from "@navis/db";
import type { Member } from "@navis/validation";

/** Postgres "relation does not exist". 로컬 docker Postgres 에는 auth 스키마가 없다. */
const UNDEFINED_TABLE = "42P01";

// drizzle 이 드라이버 오류를 감싸 cause 에 두는 경우가 있어 둘 다 본다.
const pgCode = (err: unknown): string | undefined => {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
};

const byLabel = (a: Member, b: Member) => a.label.localeCompare(b.label);

/** 회원 목록(label 순). 지워졌거나 막힌 회원은 뺀다. auth 스키마가 없으면 나비스 표에서 모은다. */
export async function list(): Promise<Member[]> {
  try {
    const rows = await db.execute<{ id: string; email: string | null }>(
      sql`select id::text as id, email from auth.users
          where deleted_at is null and (banned_until is null or banned_until < now())`,
    );
    return [...rows].map((r) => ({ id: r.id, label: r.email || r.id.slice(0, 8) })).sort(byLabel);
  } catch (err) {
    if (pgCode(err) !== UNDEFINED_TABLE) throw err;
    // 로컬 개발 — 이메일이 없으니 uuid 앞 8자로 부른다.
    const rows = await db.execute<{ id: string }>(
      sql`select distinct user_id::text as id from conversations`,
    );
    return [...rows].map((r) => ({ id: r.id, label: r.id.slice(0, 8) })).sort(byLabel);
  }
}

export type MatchResult =
  | { kind: "one"; member: Member }
  | { kind: "none" }
  | { kind: "ambiguous"; candidates: Member[] };

const localPart = (label: string) => label.split("@")[0] ?? label;

/**
 * 관리자가 부른 이름(to)을 회원 하나로 정한다. 순수 함수.
 *
 * 단계: 표시 완전 일치 → 이메일 앞부분 완전 일치 → 이메일 앞부분이 to 를 포함. 대소문자 무시.
 * 앞 단계에서 정해지면(하나든 여럿이든) 멈춘다 — "kim" 이 kim@ 과 kimchi@ 둘에 걸려도 kim@ 이 정확히 맞으면 그쪽이다.
 * 목록 밖의 회원은 고를 수 없다 — 모델이 회원 id 를 지어낼 길이 없다(헌장 원칙 II).
 */
export function matchMember(members: readonly Member[], to: string): MatchResult {
  const q = to.trim().toLowerCase();
  if (!q) return { kind: "none" };
  const stages: ((m: Member) => boolean)[] = [
    (m) => m.label.toLowerCase() === q,
    (m) => localPart(m.label).toLowerCase() === q,
    (m) => localPart(m.label).toLowerCase().includes(q),
  ];
  for (const stage of stages) {
    const hits = members.filter(stage);
    if (hits.length === 1 && hits[0]) return { kind: "one", member: hits[0] };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits };
  }
  return { kind: "none" };
}
