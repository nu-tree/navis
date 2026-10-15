// 대화방 — 목록 · 조회 · 페이지 · 생성 · 메시지 추가 · 삭제, 그리고 "나비스" 방.
//
// 서버가 권위다. 예전의 기기 간 Last-Write-Wins 동기화(클라 updatedAt 비교,
// 시계 왜곡 방어, 툼스톤, 스냅샷 업로드)는 가져오지 않는다 — 클라이언트가
// 하나이므로 그 전부가 불필요하고, 거기 있던 버그도 함께 사라진다.
//
// 메시지는 messages 표에 한 행씩 있다(specs/003 R7). 예전엔 conversations.messages jsonb 배열이었고,
// 메시지 하나를 붙일 때마다 방 배열 전체를 다시 쓰고 목록이 방마다 배열 전체를 읽었다 — 끝없이
// 길어지는 "나비스" 방에서 그 비용이 대화마다 커진다. 여기서는 추가가 한 행, 화면은 최근 페이지만.

import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { conversations, db, messages } from "@navis/db";
import {
  MESSAGE_PAGE_SIZE,
  type Conversation,
  type ConversationSummary,
  type Message,
  type MessagePage,
} from "@navis/validation";
import { MainRoomUndeletableError, NotFoundError } from "../errors";

/** 방 제목의 최대 길이. 첫 메시지에서 자를 때 쓴다(FR-034). */
const TITLE_MAX = 40;

/** "나비스" 방의 제목. 바꾸는 기능은 없다(specs/003 FR-021). */
export const MAIN_ROOM_TITLE = "나비스";

/**
 * 한 세션으로 이어 쓸 수 있는 턴 수(specs/003 R8). 넘으면 새 세션 + 최근 기록으로 잇는다.
 *
 * 세션은 그 방의 대화를 통째로 들고 다닌다. 끝없이 길어지는 "나비스" 방에서 그대로 두면 첫 토큰이
 * 점점 늦어진다. 그 이전의 사실은 기억(recall)이 맡는다.
 */
export const SESSION_TURN_LIMIT = 30;

type MessageRow = typeof messages.$inferSelect;

/**
 * meta jsonb 에 사는 필드들. relayId 밖은 와이어에서 일급 필드다.
 *
 * relayId 는 저장만 하고 와이어로 내보내지 않는다(specs/004 research R8) — 받는 회원의 응답 JSON 에
 * 실리면 화면 표시가 없어도 관리자가 보냈다는 것이 드러난다. 내부 추적은 이 행과 relays 표로 충분하다.
 */
type MessageMeta = Pick<Message, "toolsUsed" | "saved" | "origin"> & { relayId?: string };

/** 행 → 와이어. meta 의 필드를 펼친다. */
export const toMessage = (row: Pick<MessageRow, "id" | "role" | "text" | "meta" | "createdAt">): Message => {
  const meta = (row.meta ?? {}) as MessageMeta;
  return {
    id: row.id,
    role: row.role as Message["role"],
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    ...(meta.toolsUsed?.length ? { toolsUsed: meta.toolsUsed } : {}),
    ...(meta.saved ? { saved: true } : {}),
    ...(meta.origin ? { origin: meta.origin } : {}),
  };
};

/** 와이어 → meta. 없는 필드는 싣지 않는다. images 는 저장하지 않는다(턴의 입력으로만 쓴다). */
export const toMeta = (m: MessageMeta): MessageMeta => ({
  ...(m.toolsUsed?.length ? { toolsUsed: m.toolsUsed } : {}),
  ...(m.saved ? { saved: true } : {}),
  ...(m.origin ? { origin: m.origin } : {}),
  ...(m.relayId ? { relayId: m.relayId } : {}),
});

/**
 * 첫 사용자 메시지에서 제목을 만든다(FR-034).
 *
 * 줄바꿈을 공백으로 눕혀 한 줄로 만든다 — 목록에서 두 줄짜리 제목은 레이아웃을 깨고,
 * 두 번째 줄은 어차피 잘린다.
 */
export const titleFrom = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "새 대화";
  return flat.length <= TITLE_MAX ? flat : `${flat.slice(0, TITLE_MAX)}…`;
};

/** 대화 턴이 이어 쓸 세션의 상태. */
export type RoomSession = {
  id: string;
  sessionId: string | null;
  sessionTurns: number;
  isMain: boolean;
};

/** 이번 턴을 새 세션으로 시작해야 하는가(R8). 순수 함수. */
export const shouldStartFreshSession = (room: Pick<RoomSession, "sessionId" | "sessionTurns">) =>
  !room.sessionId || room.sessionTurns >= SESSION_TURN_LIMIT;

// 메시지 id 는 uuid 열이다. 형식이 다른 값을 그대로 넘기면 Postgres 가 형 변환 오류(500)를 낸다 —
// 그런 id 의 메시지는 있을 수 없으니 "없음"으로 답한다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 이 회원의 방만 맞는다. 남의 방은 없는 것과 같다(specs/002 FR-103). */
const owned = (userId: string, id: string) =>
  and(eq(conversations.id, id), eq(conversations.userId, userId));

/**
 * 회원의 "나비스" 방을 보장한다(specs/003 R9). 있으면 그대로, 없으면 만든다.
 *
 * 회원당 하나는 부분 유일 인덱스(conversations_user_main_idx)가 보장한다 — 동시에 두 번 불려도
 * 하나만 생긴다.
 */
export async function ensureMain(userId: string): Promise<{ id: string }> {
  await db
    .insert(conversations)
    .values({ id: randomUUID(), userId, title: MAIN_ROOM_TITLE, isMain: true, updatedAt: new Date() })
    .onConflictDoNothing();

  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.isMain, true)))
    .limit(1);
  // 위에서 만들었거나 이미 있었다. 없다면 인덱스가 빠진 것이다 — 조용히 넘기지 않는다.
  if (!row) throw new Error("나비스 방을 만들지 못했다(conversations_user_main_idx 확인).");
  return row;
}

/**
 * 방 목록. 메시지는 싣지 않는다 — 마지막 메시지 본문 하나만(FR-032).
 *
 * "나비스" 방을 먼저 보장한다. 처음 로그인한 회원도 목록을 부르는 순간 방이 생긴다.
 */
export async function list(userId: string): Promise<ConversationSummary[]> {
  await ensureMain(userId);

  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      sessionId: conversations.sessionId,
      isMain: conversations.isMain,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      // (conversation_id, seq desc) 인덱스로 한 행만 읽는다.
      // ★ 열을 손으로 한정한다. drizzle 은 select 안의 열 보간을 테이블 이름 없이 그려서
      //   "conversation_id" = "id" 가 messages.id(uuid)와 비교돼 형 오류가 난다.
      lastMessage: sql<string | null>`(
        select m."text" from "messages" m
        where m."conversation_id" = "conversations"."id"
        order by m."seq" desc limit 1)`,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    // 메인 방이 맨 위에 고정된다.
    .orderBy(desc(conversations.isMain), desc(conversations.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sessionId: row.sessionId,
    isMain: row.isMain,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessage: row.lastMessage,
  }));
}

/** 방의 메시지 한 페이지 — `beforeSeq` 보다 앞선 것, 오래된 → 최근 순. */
async function pageOf(
  conversationId: string,
  limit: number,
  beforeSeq?: number,
): Promise<MessagePage> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      beforeSeq === undefined
        ? eq(messages.conversationId, conversationId)
        : and(eq(messages.conversationId, conversationId), lt(messages.seq, beforeSeq)),
    )
    .orderBy(desc(messages.seq))
    // 하나 더 읽어 다음 페이지가 있는지 안다 — count 쿼리를 따로 하지 않는다.
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map(toMessage), hasMore };
}

/** 방 하나 — 최근 메시지 한 페이지와 함께. 이전 것은 page() 로 받는다(FR-026). */
export async function get(userId: string, id: string): Promise<Conversation> {
  const [row] = await db.select().from(conversations).where(owned(userId, id)).limit(1);
  if (!row) throw new NotFoundError("conversation", id);

  const first = await pageOf(id, MESSAGE_PAGE_SIZE);
  return {
    id: row.id,
    title: row.title,
    messages: first.messages,
    hasMore: first.hasMore,
    isMain: row.isMain,
    sessionId: row.sessionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 이전 메시지 한 페이지. `beforeMessageId` 보다 앞선 것.
 *
 * 남의 방이거나, 그 메시지가 이 방에 없으면 "없음"이다 — 다른 방의 메시지 id 로 커서를 만들 수 없다.
 */
export async function page(
  userId: string,
  conversationId: string,
  beforeMessageId: string,
  limit: number = MESSAGE_PAGE_SIZE,
): Promise<MessagePage> {
  if (!UUID.test(beforeMessageId)) throw new NotFoundError("message", beforeMessageId);
  const [anchor] = await db
    .select({ seq: messages.seq })
    .from(messages)
    .where(
      and(
        eq(messages.id, beforeMessageId),
        eq(messages.conversationId, conversationId),
        eq(messages.userId, userId),
      ),
    )
    .limit(1);
  if (!anchor) throw new NotFoundError("message", beforeMessageId);
  return pageOf(conversationId, limit, anchor.seq);
}

/**
 * 세션을 새로 열 때 앞에 붙일 최근 메시지(오래된 → 최근 순). 방 전체를 읽지 않는다(R8).
 */
export async function recentForHistory(
  userId: string,
  conversationId: string,
  limit: number,
): Promise<Message[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.userId, userId)))
    .orderBy(desc(messages.seq))
    .limit(limit);
  return rows.reverse().map(toMessage);
}

/**
 * 있으면 그대로, 없으면 만든다. 첫 메시지를 보낼 때 불린다(R9). 세션 상태를 돌려준다.
 *
 * ★ 같은 id 의 방이 **다른 회원의 것이면** 이어 쓰지 않고 NotFoundError(specs/002 R8). 방 id 는
 *   브라우저가 만든 uuid 라 우연한 충돌은 사실상 없다 — 이 분기는 남의 방 id 를 알아낸 경우를 막는다.
 */
export async function ensure(
  userId: string,
  id: string,
  titleSeed: string,
): Promise<RoomSession> {
  const columns = {
    id: conversations.id,
    sessionId: conversations.sessionId,
    sessionTurns: conversations.sessionTurns,
    isMain: conversations.isMain,
  };
  const [created] = await db
    .insert(conversations)
    .values({ id, userId, title: titleFrom(titleSeed), updatedAt: new Date() })
    // 이미 있으면 아무것도 바꾸지 않는다 — 제목을 덮으면 두 번째 메시지에서
    // 방 이름이 바뀐다.
    .onConflictDoNothing()
    .returning(columns);
  if (created) return created;

  // 충돌했으면 이미 있는 방이다 — 내 방일 때만 돌려준다.
  const [existing] = await db.select(columns).from(conversations).where(owned(userId, id)).limit(1);
  if (!existing) throw new NotFoundError("conversation", id);
  return existing;
}

/** 덧붙일 메시지. id · createdAt 은 없으면 만든다. */
export type NewMessage = Omit<Message, "id" | "createdAt" | "images"> &
  Partial<Pick<Message, "id" | "createdAt">> & { relayId?: string };

/**
 * 메시지를 덧붙인다 — 한 행 INSERT 와 방의 updated_at 갱신을 한 트랜잭션에서.
 *
 * 남의 방이면 NotFoundError 이고 아무것도 쓰지 않는다.
 */
export async function appendMessage(
  userId: string,
  conversationId: string,
  message: NewMessage,
): Promise<Message> {
  const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();
  // `a${Date.now()}` 는 같은 ms 안에서 충돌한다(STRUCTURE.md 5항, FR-035).
  const id = message.id ?? randomUUID();

  const row = await db.transaction(async (tx) => {
    const [room] = await tx
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(owned(userId, conversationId))
      .returning({ id: conversations.id });
    if (!room) throw new NotFoundError("conversation", conversationId);

    const [inserted] = await tx
      .insert(messages)
      .values({
        id,
        conversationId,
        userId,
        role: message.role,
        text: message.text,
        meta: toMeta(message),
        createdAt,
      })
      .returning();
    return inserted;
  });

  if (!row) throw new Error("메시지를 기록하지 못했다.");
  return toMessage(row);
}

/**
 * 이어갈 에이전트 세션과 그 세션으로 이어 쓴 턴 수를 저장한다. result 메시지가 권위다(R10).
 */
export async function setSessionId(
  userId: string,
  conversationId: string,
  sessionId: string,
  sessionTurns: number,
): Promise<void> {
  await db
    .update(conversations)
    .set({ sessionId, sessionTurns })
    .where(owned(userId, conversationId));
}

/**
 * 세션을 비운다 — 세션 밖에서 메시지가 들어왔을 때(약속 메시지). 다음 대화 턴은 새 세션으로
 * 시작하고 최근 기록(그 메시지 포함)을 앞에 붙인다(R8).
 */
export async function detachSession(userId: string, conversationId: string): Promise<void> {
  await db
    .update(conversations)
    .set({ sessionId: null, sessionTurns: 0 })
    .where(owned(userId, conversationId));
}

/**
 * 방 삭제. 메시지는 함께 지워진다(외래 키 cascade). 그 방에서 저장된 기억은 남는다 — 기억은
 * 방과 독립이다(FR-015). "나비스" 방은 지울 수 없다(specs/003 R9).
 */
export async function remove(userId: string, id: string): Promise<void> {
  const [row] = await db
    .select({ isMain: conversations.isMain })
    .from(conversations)
    .where(owned(userId, id))
    .limit(1);
  if (!row) throw new NotFoundError("conversation", id);
  if (row.isMain) throw new MainRoomUndeletableError();

  await db.delete(conversations).where(owned(userId, id));
}

/**
 * 메시지 하나 삭제.
 *
 * 중단된 질문이 남은 상태에서 다시 보내면 같은 질문이 두 번 보인다 — 그중 하나를
 * 지울 수 있어야 한다(엣지 케이스 "답 없는 질문의 연속").
 */
export async function removeMessage(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  if (!UUID.test(messageId)) throw new NotFoundError("message", messageId);
  const [row] = await db
    .delete(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.conversationId, conversationId),
        eq(messages.userId, userId),
      ),
    )
    .returning({ id: messages.id });
  if (!row) throw new NotFoundError("message", messageId);
}

