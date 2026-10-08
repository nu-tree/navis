// 설정 — Claude 구독 토큰(US5, FR-036 · FR-037 · FR-055).
//
// 토큰은 settings 테이블에 **암호문**으로 둔다(secret.ts). 키(NAVIS_SETTINGS_KEY)는 서버 환경에만
// 있다 — DB 가 새도 토큰은 새지 않는다.
//
// ★ 회원마다 자기 토큰이다(specs/002 FR-111). 모든 질의가 (user_id, key) 로 좁혀진다.
//
// ★ 평문을 프로세스 메모리에 캐시한다. 서버 인스턴스는 하나라(헌장 배포 절) set · remove 때
//   무효화하면 늘 맞다. 매 턴 DB 조회 + 복호화를 하지 않는다(헌장 성능 절).
//
// 옛 성격(시스템 프롬프트) 키는 읽지 않는다 — US5 를 Claude 토큰 관리로 바꿨다(FR-057).

import { and, eq } from "drizzle-orm";
import { db, settings } from "@navis/db";
import type { ClaudeTokenStatus } from "@navis/validation";
import { decrypt, encrypt, parseKey, SecretError } from "./secret";

export { parseKey, SecretError } from "./secret";

const KEY = "claude_oauth_token";

/** 키는 처음 쓸 때 읽는다 — 서버 부팅 검증은 apps/server/src/env.ts 가 한다. */
const settingsKey = () => {
  const raw = process.env.NAVIS_SETTINGS_KEY;
  if (!raw) throw new SecretError("NAVIS_SETTINGS_KEY 가 없다.");
  return parseKey(raw);
};

/** 회원 → 평문. 없음(undefined) = 아직 안 읽음, null = 등록 안 됨. */
const cache = new Map<string, string | null>();

const mine = (userId: string) => and(eq(settings.userId, userId), eq(settings.key, KEY));

const load = async (userId: string): Promise<{ token: string; updatedAt: Date } | null> => {
  const [row] = await db
    .select({ value: settings.value, updatedAt: settings.updatedAt })
    .from(settings)
    .where(mine(userId));
  if (!row) return null;
  // 풀리지 않으면 던진다(SecretError) — "등록 안 됨"으로 뭉개면 키가 바뀐 걸 모른다.
  return { token: decrypt(row.value, settingsKey()), updatedAt: row.updatedAt };
};

const last4 = (token: string) => token.slice(-4);

export const claudeToken = {
  /** 화면용 상태. 평문이 실릴 자리가 없다 — 반환 타입이 그것만 허용한다. */
  async status(userId: string): Promise<ClaudeTokenStatus> {
    const row = await load(userId);
    if (!row) return { registered: false, last4: null, updatedAt: null };
    cache.set(userId, row.token);
    return { registered: true, last4: last4(row.token), updatedAt: row.updatedAt.toISOString() };
  },

  async set(userId: string, token: string): Promise<ClaudeTokenStatus> {
    const value = token.trim();
    if (!value) throw new Error("빈 토큰은 저장할 수 없다.");
    const now = new Date();
    const sealed = encrypt(value, settingsKey());
    await db
      .insert(settings)
      .values({ userId, key: KEY, value: sealed, updatedAt: now })
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: { value: sealed, updatedAt: now },
      });
    cache.set(userId, value);
    return { registered: true, last4: last4(value), updatedAt: now.toISOString() };
  },

  async remove(userId: string): Promise<ClaudeTokenStatus> {
    await db.delete(settings).where(mine(userId));
    cache.set(userId, null);
    return { registered: false, last4: null, updatedAt: null };
  },

  /** 턴에서 쓸 평문. 없으면 null. */
  async resolve(userId: string): Promise<string | null> {
    if (!cache.has(userId)) cache.set(userId, (await load(userId))?.token ?? null);
    return cache.get(userId) ?? null;
  },

  /** 테스트용 — 캐시를 비워 다음 resolve 가 DB 를 다시 읽게 한다. */
  resetCache() {
    cache.clear();
  },
};
