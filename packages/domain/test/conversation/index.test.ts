// T048 — 대화방 도메인. jsonb 연산과 목록 형태가 검증 대상이라 **실제 Postgres** 를 쓴다.
// mock 으로는 `||` 이어붙이기나 `-> -1 ->> 'text'` 가 맞는지 알 수 없다.
//
// 로컬 개발 DB 를 쓰고, 테스트 전용 방 id 접두사로 격리한다. DATABASE_URL 이 없으면
// 건너뛴다 — CI 에 DB 가 없어도 다른 테스트는 돌아야 한다.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { USER_A, USER_B } from "../test-users";
import { sql } from "drizzle-orm";
import { db, conversations } from "@navis/db";
import { NotFoundError } from "../../src/errors";
import {
  appendMessage,
  ensure,
  get,
  list,
  remove,
  removeMessage,
  setSessionId,
  titleFrom,
} from "../../src/conversation/index";

const PREFIX = "test-conv-";
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
});

describeDb("대화방 (실제 DB)", () => {
  beforeAll(async () => {
    await db.delete(conversations).where(sql`id like ${PREFIX + "%"}`);
  });
  afterEach(async () => {
    await db.delete(conversations).where(sql`id like ${PREFIX + "%"}`);
  });

  it("ensure 가 방을 만들고 첫 메시지로 제목을 정한다", async () => {
    const c = await ensure(USER_A, id("a"), "배포는 어디로 할까?");
    expect(c.title).toBe("배포는 어디로 할까?");
    expect(c.messages).toEqual([]);
    expect(c.sessionId).toBeNull();
  });

  // 제목을 덮으면 두 번째 메시지에서 방 이름이 바뀐다.
  it("ensure 를 두 번 불러도 제목이 바뀌지 않는다", async () => {
    await ensure(USER_A, id("b"), "첫 제목");
    const again = await ensure(USER_A, id("b"), "두 번째 메시지");
    expect(again.title).toBe("첫 제목");
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
    const before = await ensure(USER_A, id("e"), "x");
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

  it("list(USER_A) 가 메시지 수와 마지막 메시지만 요약한다", async () => {
    await ensure(USER_A, id("g"), "x");
    await appendMessage(USER_A, id("g"), { role: "user", text: "처음" });
    await appendMessage(USER_A, id("g"), { role: "assistant", text: "마지막" });

    const mine = (await list(USER_A)).find((r) => r.id === id("g"));
    expect(mine?.messageCount).toBe(2);
    expect(mine?.lastMessage).toBe("마지막");
  });

  it("메시지가 없는 방은 lastMessage 가 null — 빈 배열에서 터지지 않는다", async () => {
    await ensure(USER_A, id("h"), "x");
    const mine = (await list(USER_A)).find((r) => r.id === id("h"));
    expect(mine?.messageCount).toBe(0);
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

  it("setSessionId 로 세션을 저장한다 — 재시작 후 맥락 이어가기의 근거", async () => {
    await ensure(USER_A, id("j"), "x");
    await setSessionId(USER_A, id("j"), "session-abc");
    expect((await get(USER_A, id("j"))).sessionId).toBe("session-abc");
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
