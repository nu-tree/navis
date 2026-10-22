// 외부 MCP 연결(specs/002 FR-113 개정). 해시 조회 · 코드 1회용 · PKCE 는 실제 Postgres 로 본다.
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db, mcpTokens, oauthClients, oauthCodes } from "@navis/db";
import { TEST_USERS, USER_A, USER_B } from "../test-users";
import * as access from "../../src/mcp-access/index";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

describeDb("mcpAccess (실제 DB)", () => {
  const clientIds: string[] = [];
  const cleanup = async () => {
    await db.delete(mcpTokens).where(inArray(mcpTokens.userId, [...TEST_USERS]));
    await db.delete(oauthCodes).where(inArray(oauthCodes.userId, [...TEST_USERS]));
    if (clientIds.length) await db.delete(oauthClients).where(inArray(oauthClients.id, clientIds));
  };
  afterAll(cleanup);
  beforeEach(cleanup);

  const register = async (redirect = "https://claude.ai/api/mcp/auth_callback") => {
    const c = await access.registerClient({ client_name: "Claude", redirect_uris: [redirect] });
    clientIds.push(c.id);
    return c;
  };

  describe("직접 발급", () => {
    it("원문은 발급 응답에만 있고 DB 에는 해시만 있다", async () => {
      const { token, connection } = await access.issue(USER_A, "노트북");
      expect(token.startsWith("navis_")).toBe(true);
      expect(connection).toMatchObject({ label: "노트북", kind: "token", lastUsedAt: null });
      const rows = await db.select().from(mcpTokens).where(inArray(mcpTokens.userId, [USER_A]));
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it("verify 는 토큰의 주인을 돌려준다 — 회원마다 다르다", async () => {
      const a = await access.issue(USER_A);
      const b = await access.issue(USER_B);
      expect(await access.verify(a.token)).toBe(USER_A);
      expect(await access.verify(b.token)).toBe(USER_B);
      expect(await access.verify("navis_nope")).toBeNull();
      expect(await access.verify("다른-형식")).toBeNull();
    });

    it("끊으면 바로 무효다. 남의 연결은 끊지 못한다", async () => {
      const a = await access.issue(USER_A);
      expect(await access.revoke(USER_B, a.connection.id)).toBe(false);
      expect(await access.verify(a.token)).toBe(USER_A);
      expect(await access.revoke(USER_A, a.connection.id)).toBe(true);
      expect(await access.verify(a.token)).toBeNull();
    });

    it("list 는 자기 연결만", async () => {
      await access.issue(USER_A, "하나");
      await access.issue(USER_B, "둘");
      expect((await access.list(USER_A)).map((c) => c.label)).toEqual(["하나"]);
    });
  });

  describe("OAuth", () => {
    it("등록 → 허용 → 교환으로 그 회원의 토큰이 나온다", async () => {
      const client = await register();
      const { verifier, challenge } = pkce();
      const redirect = await access.authorize(USER_B, {
        client_id: client.id,
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "xyz",
      });
      const url = new URL(redirect);
      expect(url.searchParams.get("state")).toBe("xyz");
      const code = url.searchParams.get("code")!;

      const { access_token } = await access.exchangeCode({
        grant_type: "authorization_code",
        code,
        client_id: client.id,
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        code_verifier: verifier,
      });
      expect(await access.verify(access_token)).toBe(USER_B);
      expect(await access.list(USER_B)).toEqual([expect.objectContaining({ label: "Claude", kind: "oauth" })]);
    });

    it("코드는 한 번만 — 틀린 verifier 로 시도해도 사라진다", async () => {
      const client = await register();
      const { verifier, challenge } = pkce();
      const input = {
        client_id: client.id,
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      };
      const code = new URL(
        await access.authorize(USER_A, { ...input, code_challenge: challenge, code_challenge_method: "S256" }),
      ).searchParams.get("code")!;

      await expect(
        access.exchangeCode({ ...input, grant_type: "authorization_code", code, code_verifier: pkce().verifier }),
      ).rejects.toMatchObject({ code: "invalid_grant" });
      await expect(
        access.exchangeCode({ ...input, grant_type: "authorization_code", code, code_verifier: verifier }),
      ).rejects.toMatchObject({ code: "invalid_grant" });
    });

    it("등록하지 않은 redirect_uri 로는 허용할 수 없다", async () => {
      const client = await register();
      await expect(
        access.authorize(USER_A, {
          client_id: client.id,
          redirect_uri: "https://evil.example/cb",
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        }),
      ).rejects.toMatchObject({ code: "invalid_redirect_uri" });
    });

    it("localhost 는 포트가 달라도 받는다(Claude Code)", async () => {
      const client = await register("http://localhost:3118/callback");
      const redirect = await access.authorize(USER_A, {
        client_id: client.id,
        redirect_uri: "http://localhost:54321/callback",
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
      });
      expect(new URL(redirect).port).toBe("54321");
    });

    it("https 도 localhost 도 아닌 주소는 등록되지 않는다", async () => {
      await expect(
        access.registerClient({ redirect_uris: ["http://evil.example/cb"] }),
      ).rejects.toMatchObject({ code: "invalid_redirect_uri" });
    });
  });
});
