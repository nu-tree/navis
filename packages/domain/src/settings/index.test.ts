// T093 — Claude 토큰 설정. 암호문 저장 · upsert 는 실제 Postgres 로 본다.
//
// 로컬 DB 의 같은 키를 쓰므로, 시작 전 행을 보관하고 끝나면 되돌린다.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, settings } from "@navis/db";

vi.stubEnv("NAVIS_SETTINGS_KEY", randomBytes(32).toString("base64"));
const { claudeToken } = await import("./index");

const KEY = "claude_oauth_token";
const TOKEN = "sk-ant-oat01-test-token-abcd";
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb("claudeToken (실제 DB)", () => {
  let saved: { value: string; updatedAt: Date } | undefined;
  beforeAll(async () => {
    [saved] = await db.select({ value: settings.value, updatedAt: settings.updatedAt }).from(settings).where(eq(settings.key, KEY));
  });
  afterAll(async () => {
    await db.delete(settings).where(eq(settings.key, KEY));
    if (saved) await db.insert(settings).values({ key: KEY, ...saved });
  });
  beforeEach(async () => {
    await db.delete(settings).where(eq(settings.key, KEY));
    claudeToken.resetCache();
  });

  it("등록 전에는 registered: false, resolve 는 null", async () => {
    expect(await claudeToken.status()).toEqual({ registered: false, last4: null, updatedAt: null });
    expect(await claudeToken.resolve()).toBeNull();
  });

  // FR-037 — 직렬화한 상태에 원문이 없다.
  it("status 에 원문이 없고 끝 4자리만 있다", async () => {
    await claudeToken.set(TOKEN);
    const status = await claudeToken.status();
    expect(status.registered).toBe(true);
    expect(status.last4).toBe("abcd");
    expect(JSON.stringify(status)).not.toContain(TOKEN);
  });

  // FR-055 — DB 에 원문이 없다.
  it("DB 에는 암호문만 남는다", async () => {
    await claudeToken.set(TOKEN);
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
    expect(row?.value.startsWith("v1.")).toBe(true);
    expect(row?.value).not.toContain(TOKEN);
  });

  it("공백뿐인 값은 거부한다", async () => {
    await expect(claudeToken.set("   ")).rejects.toThrow();
  });

  it("교체하면 바로 새 값을 돌려준다 — 캐시가 낡지 않는다", async () => {
    await claudeToken.set(TOKEN);
    expect(await claudeToken.resolve()).toBe(TOKEN);
    await claudeToken.set("sk-ant-oat01-second-wxyz");
    expect(await claudeToken.resolve()).toBe("sk-ant-oat01-second-wxyz");
  });

  it("삭제하면 resolve 가 null", async () => {
    await claudeToken.set(TOKEN);
    await claudeToken.remove();
    expect(await claudeToken.resolve()).toBeNull();
    expect((await claudeToken.status()).registered).toBe(false);
  });

  it("다른 키로 저장된 값은 '없음'이 아니라 오류다", async () => {
    await claudeToken.set(TOKEN);
    claudeToken.resetCache();
    vi.stubEnv("NAVIS_SETTINGS_KEY", randomBytes(32).toString("base64"));
    try {
      await expect(claudeToken.resolve()).rejects.toThrow();
    } finally {
      vi.unstubAllEnvs();
      vi.stubEnv("NAVIS_SETTINGS_KEY", randomBytes(32).toString("base64"));
    }
  });
});
