// T048 · specs/003 T010 — 대화방 도메인. 페이지 커서 · 목록의 마지막 메시지 서브쿼리 · 메인 방의
// 부분 유일 인덱스가 검증 대상이라 **실제 Postgres** 를 쓴다. mock 으로는 그게 맞는지 알 수 없다.
//
// 로컬 개발 DB 를 쓰고, 테스트 전용 방 id 접두사로 격리한다. DATABASE_URL 이 없으면
// 건너뛴다 — CI 에 DB 가 없어도 다른 테스트는 돌아야 한다.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { TEST_USERS, USER_A, USER_B } from "../test-users";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, conversations, messages } from "@navis/db";
import { MainRoomUndeletableError, NotFoundError } from "../../src/errors";
import {
  appendMessage,
  detachSession,
  ensure,
  ensureMain,
  get,
  list,
  page,
  recentForHistory,
  remove,
  removeMessage,
  setSessionId,
  titleFrom,
} from "../../src/conversation/index";

const PREFIX = "test-conv-";

// list() 가 테스트 회원의 메인 방을 만든다 — 접두사가 없으니 회원 · is_main 으로 지운다.
const removeTestMainRooms = () =>
  db
    .delete(conversations)
    .where(and(inArray(conversations.userId, [...TEST_USERS]), eq(conversations.isMain, true)));
const id = (n: string) => `${PREFIX}${n}`;

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describe("titleFrom()", () => {
  it("짧은 문장은 그대로", () => {
    expect(titleFrom("배포 어떻게 할까")).toBe("배포 어떻게 할까");
  });

  // 목록에서 두 줄짜리 제목은 레이아웃을 깨고 둘째 줄은 어차피 잘린다.
  it("줄바꿈을 공백으로 눕힌다", () => {
    expect(titleFrom("첫 줄\n둘째 줄")).toBe("첫 줄 둘째 줄");
  });

  it("긴 문장은 잘라내고 말줄임을 붙인다", () => {
    const out = titleFrom("가".repeat(100));
    expect(out).toHaveLength(41); // 40자 + …
    expect(out.endsWith("…")).toBe(true);
  });

  it("빈 문자열은 기본 제목", () => {
    expect(titleFrom("   \n  ")).toBe("새 대화");
  });
});

describeDb("대화방 회원 분리 (실제 DB, specs/002 T010)", () => {
  afterEach(async () => {
    await db.delete(conversations).where(sql`id like ${PREFIX + "iso-%"}`);
    await removeTestMainRooms();
  });

  it("list(A) 에 B 의 방이 없다", async () => {
    await ensure(USER_A, id("iso-a"), "A 의 방");
    await ensure(USER_B, id("iso-b"), "B 의 방");
    const ids = (await list(USER_A)).map((r) => r.id);
    expect(ids).toContain(id("iso-a"));
    expect(ids).not.toContain(id("iso-b"));
  });

  it("남의 방은 get · remove · removeMessage 모두 NotFoundError", async () => {
    await ensure(USER_B, id("iso-c"), "B 의 방");
    const m = await appendMessage(USER_B, id("iso-c"), { role: "user", text: "B 의 글" });
    await expect(get(USER_A, id("iso-c"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(remove(USER_A, id("iso-c"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeMessage(USER_A, id("iso-c"), m.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await get(USER_B, id("iso-c"))).messages).toHaveLength(1);
  });

  // research R8 — 남의 방 id 로 이어 쓰지 않는다.
  it("남의 방 id 로 ensure · appendMessage 하면 NotFoundError 이고 B 의 방은 그대로다", async () => {
    await ensure(USER_B, id("iso-d"), "B 의 제목");
    await expect(ensure(USER_A, id("iso-d"), "A 가 가로채기")).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      appendMessage(USER_A, id("iso-d"), { role: "user", text: "끼어들기" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const room = await get(USER_B, id("iso-d"));
    expect(room.title).toBe("B 의 제목");
    expect(room.messages).toHaveLength(0);
  });

  it("남의 방은 page · recentForHistory 로도 읽을 수 없다", async () => {
    await ensure(USER_B, id("iso-e"), "B");
    const m1 = await appendMessage(USER_B, id("iso-e"), { role: "user", text: "1" });
    await appendMessage(USER_B, id("iso-e"), { role: "user", text: "2" });
    await expect(page(USER_A, id("iso-e"), m1.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await recentForHistory(USER_A, id("iso-e"), 20)).toEqual([]);
  });

  it("메인 방은 회원마다 따로다", async () => {
    const a = await ensureMain(USER_A);
    const b = await ensureMain(USER_B);
    expect(a.id).not.toBe(b.id);
    await expect(get(USER_A, b.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describeDb("대화방 (실제 DB)", () => {
  beforeAll(async () => {
    await db.delete(conversations).where(sql`id like ${PREFIX + "%"}`);
    await removeTestMainRooms();
  });
  afterEach(async () => {
    await db.delete(conversations).where(sql`id like ${PREFIX + "%"}`);
    await removeTestMainRooms();
  });

  it("ensure 가 방을 만들고 첫 메시지로 제목을 정한다", async () => {
    const s = await ensure(USER_A, id("a"), "배포는 어디로 할까?");
    expect(s).toEqual({ id: id("a"), sessionId: null, sessionTurns: 0, isMain: false });
    const c = await get(USER_A, id("a"));
    expect(c.title).toBe("배포는 어디로 할까?");
    expect(c.messages).toEqual([]);
    expect(c.hasMore).toBe(false);
  });

  // 제목을 덮으면 두 번째 메시지에서 방 이름이 바뀐다.
  it("ensure 를 두 번 불러도 제목이 바뀌지 않는다", async () => {
    await ensure(USER_A, id("b"), "첫 제목");
    await ensure(USER_A, id("b"), "두 번째 메시지");
    expect((await get(USER_A, id("b"))).title).toBe("첫 제목");
  });

  it("appendMessage 가 기존 메시지를 지우지 않는다", async () => {
    await ensure(USER_A, id("c"), "x");
    await appendMessage(USER_A, id("c"), { role: "user", text: "하나" });
    await appendMessage(USER_A, id("c"), { role: "assistant", text: "둘" });
    const c = await get(USER_A, id("c"));
    expect(c.messages.map((m) => m.text)).toEqual(["하나", "둘"]);
  });

  // `a${Date.now()}` 는 같은 ms 안에서 충돌한다(STRUCTURE.md 5항).
  it("같은 ms 에 만든 메시지도 id 가 겹치지 않는다", async () => {
    await ensure(USER_A, id("d"), "x");
    const [m1, m2, m3] = await Promise.all([
      appendMessage(USER_A, id("d"), { role: "user", text: "1" }),
      appendMessage(USER_A, id("d"), { role: "user", text: "2" }),
      appendMessage(USER_A, id("d"), { role: "user", text: "3" }),
    ]);
    expect(new Set([m1.id, m2.id, m3.id]).size).toBe(3);
  });

  it("appendMessage 가 updatedAt 을 올린다", async () => {
    await ensure(USER_A, id("e"), "x");
    const before = await get(USER_A, id("e"));
    await new Promise((r) => setTimeout(r, 10));
    await appendMessage(USER_A, id("e"), { role: "user", text: "하나" });
    const after = await get(USER_A, id("e"));
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
  });

  // ── 이 파일의 핵심 ──────────────────────────────────────────────────
  it("list(USER_A) 는 messages 를 반환하지 않는다 (FR-032)", async () => {
    await ensure(USER_A, id("f"), "x");
    await appendMessage(USER_A, id("f"), { role: "user", text: "본문" });

    const rows = await list(USER_A);
    const mine = rows.find((r) => r.id === id("f"));
    expect(mine).toBeDefined();
    expect(mine).not.toHaveProperty("messages");
  });

  it("list(USER_A) 가 마지막 메시지만 요약한다", async () => {
    await ensure(USER_A, id("g"), "x");
    await appendMessage(USER_A, id("g"), { role: "user", text: "처음" });
    await appendMessage(USER_A, id("g"), { role: "assistant", text: "마지막" });

    const mine = (await list(USER_A)).find((r) => r.id === id("g"));
    expect(mine?.lastMessage).toBe("마지막");
    expect(mine).not.toHaveProperty("messageCount");
  });

  it("메시지가 없는 방은 lastMessage 가 null", async () => {
    await ensure(USER_A, id("h"), "x");
    const mine = (await list(USER_A)).find((r) => r.id === id("h"));
    expect(mine?.lastMessage).toBeNull();
  });
  // ────────────────────────────────────────────────────────────────────

  it("list(USER_A) 가 최근 활동순으로 정렬한다", async () => {
    await ensure(USER_A, id("i1"), "오래된");
    await new Promise((r) => setTimeout(r, 10));
    await ensure(USER_A, id("i2"), "최근");
    const rows = (await list(USER_A)).filter((r) => r.id.startsWith(PREFIX));
    expect(rows[0]?.id).toBe(id("i2"));
  });

  // specs/003 R9
  it("list 가 메인 방을 만들고 맨 위에 둔다 — 다른 방이 더 최근이어도", async () => {
    await ensure(USER_A, id("main1"), "최근 방");
    await appendMessage(USER_A, id("main1"), { role: "user", text: "x" });
    const rows = await list(USER_A);
    expect(rows[0]?.isMain).toBe(true);
    expect(rows[0]?.title).toBe("나비스");
    expect(rows.filter((r) => r.isMain)).toHaveLength(1);
  });

  it("ensureMain 은 동시에 여러 번 불려도 하나만 만든다", async () => {
    const ids = await Promise.all([ensureMain(USER_A), ensureMain(USER_A), ensureMain(USER_A)]);
    expect(new Set(ids.map((r) => r.id)).size).toBe(1);
  });

  it("메인 방은 지울 수 없다", async () => {
    const main = await ensureMain(USER_A);
    await expect(remove(USER_A, main.id)).rejects.toBeInstanceOf(MainRoomUndeletableError);
    expect((await get(USER_A, main.id)).isMain).toBe(true);
  });

  // specs/003 R7 · FR-026
  it("get 은 최근 50개만, page 로 이어 받으면 중복 · 누락이 없다", async () => {
    await ensure(USER_A, id("p"), "x");
    for (let i = 0; i < 120; i++) {
      await appendMessage(USER_A, id("p"), { role: "user", text: String(i) });
    }
    const first = await get(USER_A, id("p"));
    expect(first.messages).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(first.messages.at(-1)?.text).toBe("119");

    const oldest = first.messages[0]?.id ?? "";
    const second = await page(USER_A, id("p"), oldest);
    expect(second.messages.map((m) => m.text)).toEqual(
      Array.from({ length: 50 }, (_, i) => String(20 + i)),
    );
    expect(second.hasMore).toBe(true);

    const third = await page(USER_A, id("p"), second.messages[0]?.id ?? "");
    expect(third.messages.map((m) => m.text)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i)),
    );
    expect(third.hasMore).toBe(false);
  });

  it("다른 방의 메시지 id 로 page 커서를 만들 수 없다", async () => {
    await ensure(USER_A, id("q1"), "x");
    await ensure(USER_A, id("q2"), "x");
    const other = await appendMessage(USER_A, id("q2"), { role: "user", text: "q2" });
    await expect(page(USER_A, id("q1"), other.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recentForHistory 는 최근 N 개를 오래된 → 최근 순으로 준다", async () => {
    await ensure(USER_A, id("r"), "x");
    for (let i = 0; i < 25; i++) {
      await appendMessage(USER_A, id("r"), { role: "user", text: String(i) });
    }
    const recent = await recentForHistory(USER_A, id("r"), 20);
    expect(recent.map((m) => m.text)).toEqual(Array.from({ length: 20 }, (_, i) => String(5 + i)));
  });

  it("meta 필드(toolsUsed · saved · origin)가 왕복한다", async () => {
    await ensure(USER_A, id("s"), "x");
    const origin = { kind: "promise" as const, promiseId: "p-1", label: "물 마시기" };
    await appendMessage(USER_A, id("s"), {
      role: "assistant",
      text: "물 드셨어요?",
      toolsUsed: ["WebSearch"],
      saved: true,
      origin,
    });
    const [m] = (await get(USER_A, id("s"))).messages;
    expect(m).toMatchObject({ toolsUsed: ["WebSearch"], saved: true, origin });
  });

  // specs/004 research R8 — 전하기 출처는 저장만 하고 받는 회원의 응답에는 흔적이 없어야 한다.
  it("relayId 는 meta 에 남지만 와이어 Message 에는 실리지 않는다", async () => {
    await ensure(USER_A, id("r"), "x");
    const relayId = "11111111-1111-4111-8111-111111111111";
    const sent = await appendMessage(USER_A, id("r"), { role: "assistant", text: "회의가 11시로 바뀌었어요.", relayId });

    const [row] = await db.select({ meta: messages.meta }).from(messages).where(eq(messages.id, sent.id));
    expect(row?.meta).toEqual({ relayId });

    const wire = [sent, ...(await get(USER_A, id("r"))).messages, ...(await recentForHistory(USER_A, id("r"), 10))];
    for (const m of wire) {
      expect(m).not.toHaveProperty("relayId");
      expect(m).not.toHaveProperty("origin");
    }
  });

  it("detachSession 은 세션과 턴 수를 비운다", async () => {
    await ensure(USER_A, id("t"), "x");
    await setSessionId(USER_A, id("t"), "s-1", 12);
    await detachSession(USER_A, id("t"));
    expect(await ensure(USER_A, id("t"), "x")).toMatchObject({ sessionId: null, sessionTurns: 0 });
  });

  it("setSessionId 로 세션을 저장한다 — 재시작 후 맥락 이어가기의 근거", async () => {
    await ensure(USER_A, id("j"), "x");
    await setSessionId(USER_A, id("j"), "session-abc", 3);
    expect((await get(USER_A, id("j"))).sessionId).toBe("session-abc");
    expect((await ensure(USER_A, id("j"), "x")).sessionTurns).toBe(3);
  });

  it("removeMessage 가 하나만 지운다", async () => {
    await ensure(USER_A, id("k"), "x");
    const m1 = await appendMessage(USER_A, id("k"), { role: "user", text: "남길 것" });
    const m2 = await appendMessage(USER_A, id("k"), { role: "user", text: "지울 것" });
    await removeMessage(USER_A, id("k"), m2.id);
    const c = await get(USER_A, id("k"));
    expect(c.messages.map((m) => m.id)).toEqual([m1.id]);
  });

  it("remove 가 방을 지운다", async () => {
    await ensure(USER_A, id("l"), "x");
    await remove(USER_A, id("l"));
    await expect(get(USER_A, id("l"))).rejects.toThrow(NotFoundError);
  });

  // 메시지 문자열로 status 를 정하면 문구를 다듬을 때 404 가 500 이 된다.
  it.each([
    ["get", () => get(USER_A, id("없음"))],
    ["remove", () => remove(USER_A, id("없음"))],
    ["appendMessage", () => appendMessage(USER_A, id("없음"), { role: "user", text: "x" })],
    ["removeMessage", () => removeMessage(USER_A, id("없음"), "msg")],
  ])("%s 는 없는 id 에 NotFoundError", async (_name, fn) => {
    await expect(fn()).rejects.toThrow(NotFoundError);
  });

  it("있는 방의 없는 메시지도 NotFoundError", async () => {
    await ensure(USER_A, id("m"), "x");
    await expect(removeMessage(USER_A, id("m"), "없는-메시지")).rejects.toThrow(NotFoundError);
  });
});
