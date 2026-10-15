// specs/004 T010 — 전하기 저장 · 선점 · 완료 · 보존. 선점의 SKIP LOCKED 와 보존 쿼리가 검증 대상이라
// **실제 Postgres** 를 쓴다.
//
// ★ 공용 테스트 회원(USER_A/B)을 쓰지 않는다 — settings 테스트가 그 회원의 토큰 행을 지우며 병렬로 돈다.
//   이 파일 전용 uuid 로 격리한다.
import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, relays, settings } from "@navis/db";

vi.stubEnv("NAVIS_SETTINGS_KEY", randomBytes(32).toString("base64"));
const { claudeToken } = await import("../../src/settings/index");
const relay = await import("../../src/relay/index");
const { ClaudeTokenMissingError } = await import("../../src/errors");
const { list: listMembers } = await import("../../src/member/index");

const SENDER = "00000000-0000-4000-8000-0000000004a1";
const OTHER_SENDER = "00000000-0000-4000-8000-0000000004a2";
const RECIPIENT = { id: "00000000-0000-4000-8000-0000000004b1", label: "jimin@example.com" };
const SENDERS = [SENDER, OTHER_SENDER];

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb("relay (실제 DB)", () => {
  const cleanup = async () => {
    await db.delete(relays).where(inArray(relays.senderId, SENDERS));
    await db.delete(settings).where(inArray(settings.userId, SENDERS));
    claudeToken.resetCache();
  };
  afterAll(cleanup);
  beforeEach(async () => {
    await cleanup();
    await claudeToken.set(SENDER, "sk-ant-oat01-relay-test");
    await claudeToken.set(OTHER_SENDER, "sk-ant-oat01-relay-test-2");
  });

  const rowsOf = (senderId: string) => db.select().from(relays).where(eq(relays.senderId, senderId));

  it("관리자 토큰이 없으면 ClaudeTokenMissingError 이고 행이 생기지 않는다 (FR-023)", async () => {
    await claudeToken.remove(SENDER);
    await expect(relay.create(SENDER, RECIPIENT, "물 마셨는지 물어봐줘")).rejects.toBeInstanceOf(ClaudeTokenMissingError);
    expect(await rowsOf(SENDER)).toHaveLength(0);
  });

  it("create 는 pending 행을 넣고, 반환에 messageId 가 없다 (FR-019)", async () => {
    const item = await relay.create(SENDER, RECIPIENT, "물 마셨는지 물어봐줘");
    expect(item).toMatchObject({ to: "jimin@example.com", instruction: "물 마셨는지 물어봐줘", status: "pending", error: null, finishedAt: null });
    expect(item).not.toHaveProperty("messageId");
    const [row] = await rowsOf(SENDER);
    expect(row).toMatchObject({ senderId: SENDER, recipientId: RECIPIENT.id, status: "pending" });
  });

  it("보존 — 끝난 행은 최근 RELAYS_KEPT 개만, 끝나지 않은 행은 지우지 않는다", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const finished = Array.from({ length: relay.RELAYS_KEPT }, (_, i) => ({
      id: crypto.randomUUID(),
      senderId: SENDER,
      recipientId: RECIPIENT.id,
      recipientLabel: RECIPIENT.label,
      instruction: `old ${i}`,
      status: "delivered",
      createdAt: new Date(old.getTime() + i * 1000),
    }));
    const stillPending = { ...finished[0]!, id: crypto.randomUUID(), status: "pending", createdAt: new Date(old.getTime() - 1000) };
    await db.insert(relays).values([...finished, stillPending]);

    await relay.create(SENDER, RECIPIENT, "새 지시");

    const rows = await rowsOf(SENDER);
    // 새 것 1 + 끝난 것 중 최신 49 + 가장 오래됐지만 pending 인 것 1
    expect(rows).toHaveLength(relay.RELAYS_KEPT + 1);
    expect(rows.some((r) => r.instruction === "old 0" && r.status === "delivered")).toBe(false);
    expect(rows.some((r) => r.id === stillPending.id)).toBe(true);
  });

  it("claimPending 은 같은 행을 두 번 집지 않고 running + 임대를 건다", async () => {
    await relay.create(SENDER, RECIPIENT, "하나");
    await relay.create(SENDER, RECIPIENT, "둘");
    const [a, b] = await Promise.all([relay.claimPending(5), relay.claimPending(5)]);
    const mine = [...a!, ...b!].filter((r) => r.senderId === SENDER);
    expect(mine.map((r) => r.instruction).sort()).toEqual(["둘", "하나"]);

    const rows = await rowsOf(SENDER);
    expect(rows.every((r) => r.status === "running" && r.leaseUntil)).toBe(true);
    // 다시 불러도 running 은 집지 않는다
    expect((await relay.claimPending(5)).filter((r) => r.senderId === SENDER)).toHaveLength(0);
  });

  it("임대가 지난 running 은 다시 집지 않고 실패로 닫는다", async () => {
    await relay.create(SENDER, RECIPIENT, "멈춤");
    await relay.claimPending(5);
    const later = new Date(Date.now() + 60 * 60 * 1000);
    const again = await relay.claimPending(5, later);
    expect(again.filter((r) => r.senderId === SENDER)).toHaveLength(0);
    const [row] = await rowsOf(SENDER);
    expect(row).toMatchObject({ status: "failed", error: "서버가 실행 중에 멈췄어요.", leaseUntil: null });
  });

  it("complete — delivered 는 messageId, failed 는 error, 둘 다 finishedAt", async () => {
    const a = await relay.create(SENDER, RECIPIENT, "a");
    const b = await relay.create(SENDER, RECIPIENT, "b");
    const messageId = crypto.randomUUID();
    await relay.complete(a.id, { status: "delivered", messageId });
    await relay.complete(b.id, { status: "failed", error: "나비스가 전하지 않았어요." });
    const rows = await rowsOf(SENDER);
    expect(rows.find((r) => r.id === a.id)).toMatchObject({ status: "delivered", messageId });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ status: "failed", error: "나비스가 전하지 않았어요." });
    expect(rows.every((r) => r.finishedAt)).toBe(true);
    // 끝난 것은 집지 않는다
    expect((await relay.claimPending(5)).filter((r) => r.senderId === SENDER)).toHaveLength(0);
  });

  it("list 는 최신순이고 남의 sender 행이 없다", async () => {
    await relay.create(SENDER, RECIPIENT, "첫째");
    await relay.create(SENDER, RECIPIENT, "둘째");
    await relay.create(OTHER_SENDER, RECIPIENT, "남의 것");
    const items = await relay.list(SENDER);
    expect(items.map((i) => i.instruction)).toEqual(["둘째", "첫째"]);
    expect(items.every((i) => !("messageId" in i))).toBe(true);
  });
});

describeDb("member.list (실제 DB)", () => {
  it("auth 스키마가 있든 없든 회원 목록을 label 순으로 준다", async () => {
    const members = await listMembers();
    const labels = members.map((m) => m.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(members.every((m) => m.id && m.label)).toBe(true);
  });
});
