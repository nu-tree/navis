import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  vector,
  index,
  uniqueIndex,
  primaryKey,
  bigint,
  boolean,
  integer,
  check,
} from "drizzle-orm/pg-core";

// ── 저장 레이아웃 ────────────────────────────────────────────────────────────
// 여기는 "디스크에 어떻게 놓이는가" 이고, 와이어 계약은 @navis/validation 이다.
// 둘이 일부러 다르다: tags·done 은 DB 에선 metadata jsonb 안에 살고, 밖으로는
// 일급 필드로 나간다. 그 매핑은 domain 의 몫이다 — 저장 형태를 바꾸겠다고
// 기존 데이터를 마이그레이션할 이유가 없다.
//
// 분류 값의 집합(CATEGORIES)은 @navis/validation 에 있다. 여기 두면 그 enum 이
// 필요한 클라이언트가 drizzle 을 통째로 끌어와야 한다.

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 주인 회원(Supabase 사용자 uuid). 외래 키는 걸지 않는다 — 다른 스키마의 테이블이다(specs/002).
    // 주인 없는 행은 없다(FR-101). 운영 전환(2026-10-08)은 0008 추가 → 기존 행 채우기 → 0009 NOT NULL.
    userId: uuid("user_id").notNull(),
    content: text("content").notNull(),
    category: text("category"),
    // 프로젝트 스코프(nullable). null = 개인/전역 기억.
    // 카테고리와 직교하는 두 번째 축 ("navis 프로젝트의 todo" 같은 검색용).
    project: text("project"),
    embedding: vector("embedding", { dimensions: 1024 }),
    // tags: string[], done: boolean, relatedIds: string[] 가 여기 들어간다.
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("memories_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    // 모든 목록이 회원으로 먼저 좁혀진다 — 단일 열 created_at 인덱스는 이것으로 대체했다.
    index("memories_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("memories_category_idx").on(t.category),
    index("memories_project_idx").on(t.project),
  ],
);

// 대화방. 클라이언트가 만든 방 id 라 text PK. 메시지는 messages 표에 있다(specs/003 R7).
//
// 예전엔 여기에 kind/unread/hidden/deletedAt 이 있었다 — 전부 여러 기기 간
// Last-Write-Wins 동기화와 보고방 때문이었다. 클라이언트가 하나이고 서버가
// 권위를 가지면 필요 없다.
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    // 주인 회원. 방 id 는 전역 유일 그대로 — 남의 방 id 로는 이어 쓰지 않는다(specs/002 R8).
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    // ★ 더 이상 읽거나 쓰지 않는다 — 메시지는 messages 표에 있다(specs/003 R7). 운영에서 이전을
    //   대조한 뒤 지운다(tasks T013). 그 전에 지우면 db:migrate 한 번에 0011 · 열 삭제가 같이 적용돼
    //   대조할 틈이 없다.
    messages: jsonb("messages").notNull().default([]),
    // 이어갈 에이전트 세션 id — 방마다 맥락을 분리한다.
    sessionId: text("session_id"),
    // 지금 세션으로 이어 쓴 턴 수. 30 이상이면 새 세션 + 최근 기록으로 잇는다(specs/003 R8) —
    // 끝없이 길어지는 "나비스" 방에서 세션 맥락이 커져 첫 토큰이 늦어지는 것을 막는다.
    sessionTurns: integer("session_turns").notNull().default(0),
    // 회원마다 하나인 "나비스" 방(specs/003 R9). 지울 수 없고, 약속 메시지가 여기로 온다.
    isMain: boolean("is_main").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  // 목록은 언제나 회원으로 먼저 좁혀진다 — 단일 열 updated_at 인덱스는 이것으로 대체했다.
  (t) => [
    index("conversations_user_updated_idx").on(t.userId, t.updatedAt.desc()),
    // 회원당 메인 방은 하나 — ensureMain 의 ON CONFLICT 가 이 인덱스에 기댄다.
    uniqueIndex("conversations_user_main_idx").on(t.userId).where(sql`${t.isMain}`),
  ],
);

// 대화 메시지 — 한 행에 하나(specs/003 R7).
//
// 예전엔 conversations.messages jsonb 배열에 통째로 있었다. 그러면 메시지 하나를 붙일 때마다
// 방 배열 전체를 다시 쓰고, 방 목록이 방마다 배열 전체를 읽는다. 끝없이 길어지는 "나비스" 방에서
// 그 비용이 대화마다 커진다. 여기서는 추가가 한 행, 화면은 최근 페이지만 읽는다.
//
// seq 가 정렬 · 커서다. created_at 은 같은 ms 에 겹칠 수 있다.
// toolsUsed · saved · origin 은 meta jsonb 에 산다. 일급 필드로의 매핑은 domain 의 몫이다
// (memories.metadata 와 같은 방식).
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey(),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(),
    text: text("text").notNull(),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("messages_conversation_seq_idx").on(t.conversationId, t.seq.desc())],
);

// 약속 — 나비스가 나중의 자기에게 남기는 일(specs/003). 종류 구분이 없다: 무엇을 할지는
// instruction 과 실행 때의 모델 판단이 정한다(헌장 원칙 I).
export const promises = pgTable(
  "promises",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    instruction: text("instruction").notNull(),
    // 화면 · 출처 표시용 짧은 요약(최대 40자).
    label: text("label").notNull(),
    // once | cron. once 면 run_at, cron 이면 cron 식(Asia/Seoul).
    scheduleKind: text("schedule_kind").notNull(),
    runAt: timestamp("run_at", { withTimezone: true }),
    cron: text("cron"),
    // 실행마다 나비스가 스스로 고치는 상태 메모. 다음 실행이 본다.
    memo: text("memo").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    // 실행 임대(R3). 서버가 실행 중에 죽으면 만료 뒤 다음 tick 이 다시 집는다.
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    // 만든 대화방. 방이 지워져도 약속은 남는다 — 외래 키를 걸지 않는다.
    originConversationId: text("origin_conversation_id"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // tick 조회. 켜진 것만 본다.
    index("promises_due_idx").on(t.nextRunAt).where(sql`${t.enabled}`),
    index("promises_user_idx").on(t.userId, t.nextRunAt),
    check(
      "promises_schedule_check",
      sql`(${t.scheduleKind} = 'once' and ${t.runAt} is not null and ${t.cron} is null)
       or (${t.scheduleKind} = 'cron' and ${t.cron} is not null and ${t.runAt} is null)`,
    ),
  ],
);

// 약속의 한 회차. 중복 실행을 막는 근거이자 화면의 실행 기록이다. 약속마다 최근 20개만 남긴다.
export const promiseRuns = pgTable(
  "promise_runs",
  {
    id: uuid("id").primaryKey(),
    promiseId: uuid("promise_id")
      .notNull()
      .references(() => promises.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // running | spoke | silent | failed
    status: text("status").notNull(),
    error: text("error"),
    messageId: uuid("message_id"),
  },
  (t) => [index("promise_runs_promise_started_idx").on(t.promiseId, t.startedAt.desc())],
);

// key→value 설정. 지금은 회원마다 Claude 토큰(암호문) 하나.
export const settings = pgTable(
  "settings",
  {
    // 주인 회원. 회원마다 같은 키(claude_oauth_token)를 하나씩 갖는다.
    userId: uuid("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// 웹 푸시 구독 — 회원의 기기(브라우저 · 설치한 앱)마다 한 행. 창을 닫아도 답 도착을 알린다.
// endpoint 가 기기의 주소라 전역 유일이다. 같은 기기에서 다른 회원으로 로그인하면 주인이 바뀐다.
// 푸시 서비스가 404 · 410 을 주면(구독 해지 · 만료) domain 이 지운다.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: uuid("user_id").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

// 전하기 — 관리자가 한 회원의 나비스에게 맡긴 지시 하나(specs/004). 한 번 실행되고 끝난다.
//
// 약속 행을 쓰지 않는 이유(research R1): 약속은 받는 회원의 것이라 약속 화면에 지시 원문이 보이고,
// 약속 턴은 그 회원의 토큰으로 돌며, 약속에는 "조용함"이 정상이다. 전하기는 셋 다 아니다.
//
// 외래 키를 걸지 않는다 — 회원은 다른 스키마의 테이블이고, 받는 회원이 방을 지워도 기록은 남아야 한다.
export const relays = pgTable(
  "relays",
  {
    id: uuid("id").primaryKey(),
    // 보낸 관리자. 전하기 턴의 토큰 주인이다(FR-022). 목록 · 보존은 이 열로 좁힌다.
    senderId: uuid("sender_id").notNull(),
    // 받는 회원. 기억 · 대화방 · 전달이 이 회원의 것이다.
    recipientId: uuid("recipient_id").notNull(),
    // 보낼 때의 표시(이메일 등). 기록 화면이 매번 auth.users 를 다시 읽지 않게 남긴다.
    recipientLabel: text("recipient_label").notNull(),
    instruction: text("instruction").notNull(),
    // pending | running | delivered | failed
    status: text("status").notNull(),
    // failed 일 때 사람이 읽는 이유. 모델 출력이 아니다 — 받는 회원의 기억이 섞일 수 있다(research R9).
    error: text("error"),
    // 도착한 메시지. 내부 추적용 — 와이어로 나가지 않는다(FR-019).
    messageId: uuid("message_id"),
    // 실행 임대. 만료된 running 은 다시 집지 않고 실패로 닫는다(data-model "상태 전이").
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    // tick 조회. 끝나지 않은 것만 본다.
    index("relays_pending_idx").on(t.createdAt).where(sql`${t.status} in ('pending', 'running')`),
    index("relays_sender_created_idx").on(t.senderId, t.createdAt.desc()),
  ],
);
