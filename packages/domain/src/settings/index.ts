// 설정 — Claude 구독 토큰(US5, FR-036 · FR-037 · FR-055).
//
// 토큰은 settings 테이블에 **암호문**으로 둔다(secret.ts). 키(NAVIS_SETTINGS_KEY)는 서버 환경에만
// 있다 — DB 가 새도 토큰은 새지 않는다.
//
// ★ 평문을 프로세스 메모리에 캐시한다. 서버 인스턴스는 하나라(헌장 배포 절) set · remove 때
//   무효화하면 늘 맞다. 매 턴 DB 조회 + 복호화를 하지 않는다(헌장 성능 절).
//
// 옛 성격(시스템 프롬프트) 키는 읽지 않는다 — US5 를 Claude 토큰 관리로 바꿨다(FR-057).

import { eq } from "drizzle-orm";
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

/** undefined = 아직 안 읽음, null = 등록 안 됨. */
let cached: string | null | undefined;

const load = async (): Promise<{ token: string; updatedAt: Date } | null> => {
  const [row] = await db
    .select({ value: settings.value, updatedAt: settings.updatedAt })
    .from(settings)
    .where(eq(settings.key, KEY));
  if (!row) return null;
  // 풀리지 않으면 던진다(SecretError) — "등록 안 됨"으로 뭉개면 키가 바뀐 걸 모른다.
  return { token: decrypt(row.value, settingsKey()), updatedAt: row.updatedAt };
};

const last4 = (token: string) => token.slice(-4);

export const claudeToken = {
  /** 화면용 상태. 평문이 실릴 자리가 없다 — 반환 타입이 그것만 허용한다. */
  async status(): Promise<ClaudeTokenStatus> {
    const row = await load();
    if (!row) return { registered: false, last4: null, updatedAt: null };
    cached = row.token;
    return { registered: true, last4: last4(row.token), updatedAt: row.updatedAt.toISOString() };
  },

  async set(token: string): Promise<ClaudeTokenStatus> {
    const value = token.trim();
    if (!value) throw new Error("빈 토큰은 저장할 수 없다.");
    const now = new Date();
    const sealed = encrypt(value, settingsKey());
    await db
      .insert(settings)
      .values({ key: KEY, value: sealed, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value: sealed, updatedAt: now } });
    cached = value;
    return { registered: true, last4: last4(value), updatedAt: now.toISOString() };
  },

  async remove(): Promise<ClaudeTokenStatus> {
    await db.delete(settings).where(eq(settings.key, KEY));
    cached = null;
    return { registered: false, last4: null, updatedAt: null };
  },

  /** 턴에서 쓸 평문. 없으면 null. */
  async resolve(): Promise<string | null> {
    if (cached === undefined) cached = (await load())?.token ?? null;
    return cached;
  },

  /** 테스트용 — 캐시를 비워 다음 resolve 가 DB 를 다시 읽게 한다. */
  resetCache() {
    cached = undefined;
  },
};
