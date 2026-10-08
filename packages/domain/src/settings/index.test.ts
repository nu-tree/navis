// T093 — Claude 토큰 설정. 암호문 저장 · upsert 는 실제 Postgres 로 본다.
//
// 로컬 DB 의 같은 키를 쓰므로, 시작 전 행을 보관하고 끝나면 되돌린다.
import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_USERS, USER_A, USER_B } from "../test-users";
import { and, eq, inArray } from "drizzle-orm";
import { db, settings } from "@navis/db";

vi.stubEnv("NAVIS_SETTINGS_KEY", randomBytes(32).toString("base64"));
const { claudeToken } = await import("./index");

const KEY = "claude_oauth_token";
const TOKEN = "sk-ant-oat01-test-token-abcd";
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb("claudeToken (실제 DB)", () => {
  // 테스트 회원의 행만 만들고 지운다 — 관리자의 실제 토큰은 건드리지 않는다.
  const cleanup = () => db.delete(settings).where(inArray(settings.userId, [...TEST_USERS]));
  afterAll(cleanup);
  beforeEach(async () => {
    await cleanup();
    claudeToken.resetCache();
  });

  it("등록 전에는 registered: false, resolve 는 null", async () => {
    expect(await claudeToken.status(USER_A)).toEqual({ registered: false, last4: null, updatedAt: null });
    expect(await claudeToken.resolve(USER_A)).toBeNull();
  });

  // FR-037 — 직렬화한 상태에 원문이 없다.
  it("status 에 원문이 없고 끝 4자리만 있다", async () => {
    await claudeToken.set(USER_A, TOKEN);
    const status = await claudeToken.status(USER_A);
    expect(status.registered).toBe(true);
    expect(status.last4).toBe("abcd");
    expect(JSON.stringify(status)).not.toContain(TOKEN);
  });

  // FR-055 — DB 에 원문이 없다.
  it("DB 에는 암호문만 남는다", async () => {
    await claudeToken.set(USER_A, TOKEN);
    const [row] = await db
      .select()
      .from(settings)
      .where(and(eq(settings.userId, USER_A), eq(settings.key, KEY)));
    expect(row?.value.startsWith("v1.")).toBe(true);
    expect(row?.value).not.toContain(TOKEN);
  });

  it("공백뿐인 값은 거부한다", async () => {
    await expect(claudeToken.set(USER_A, "   ")).rejects.toThrow();
  });

  it("교체하면 바로 새 값을 돌려준다 — 캐시가 낡지 않는다", async () => {
    await claudeToken.set(USER_A, TOKEN);
    expect(await claudeToken.resolve(USER_A)).toBe(TOKEN);
    await claudeToken.set(USER_A, "sk-ant-oat01-second-wxyz");
    expect(await claudeToken.resolve(USER_A)).toBe("sk-ant-oat01-second-wxyz");
  });

  it("삭제하면 resolve 가 null", async () => {
    await claudeToken.set(USER_A, TOKEN);
    await claudeToken.remove(USER_A);
    expect(await claudeToken.resolve(USER_A)).toBeNull();
    expect((await claudeToken.status(USER_A)).registered).toBe(false);
  });

  // specs/002 T025 — 회원마다 따로다.
  it("A 만 등록하면 B 는 미등록이고 resolve(B) 는 null", async () => {
    await claudeToken.set(USER_A, TOKEN);
    expect((await claudeToken.status(USER_B)).registered).toBe(false);
    expect(await claudeToken.resolve(USER_B)).toBeNull();
    expect(await claudeToken.resolve(USER_A)).toBe(TOKEN);
  });

  it("B 가 등록 · 삭제해도 A 는 그대로", async () => {
    await claudeToken.set(USER_A, TOKEN);
    await claudeToken.set(USER_B, "sk-ant-oat01-other-zzzz");
    expect((await claudeToken.status(USER_A)).last4).toBe("abcd");
    await claudeToken.remove(USER_B);
    expect(await claudeToken.resolve(USER_A)).toBe(TOKEN);
    // 캐시를 비우고 DB 에서 다시 읽어도 같다.
    claudeToken.resetCache();
    expect(await claudeToken.resolve(USER_A)).toBe(TOKEN);
    expect(await claudeToken.resolve(USER_B)).toBeNull();
  });

  it("다른 키로 저장된 값은 '없음'이 아니라 오류다", async () => {
    await claudeToken.set(USER_A, TOKEN);
    claudeToken.resetCache();
    vi.stubEnv("NAVIS_SETTINGS_KEY", randomBytes(32).toString("base64"));
    try {
      await expect(claudeToken.resolve(USER_A)).rejects.toThrow();
    } finally {
      vi.unstubAllEnvs();
      vi.stubEnv("NAVIS_SETTINGS_KEY", randomBytes(32).toString("base64"));
    }
  });
});
