import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  vector,
  boolean,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const CATEGORIES = [
  "decision",
  "learning",
  "idea",
  "feeling",
  "people",
  "todo",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    content: text("content").notNull(),
    category: text("category"),
    // 프로젝트 스코프(nullable). null = 개인/전역 기억. 값이 있으면 그 프로젝트 기억.
    // 카테고리와 직교하는 두 번째 축 ("navis 프로젝트의 todo" 같은 검색용).
    project: text("project"),
    embedding: vector("embedding", { dimensions: 1024 }),
    source: text("source"),
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
    index("memories_created_at_idx").on(t.createdAt.desc()),
    index("memories_category_idx").on(t.category),
    index("memories_project_idx").on(t.project),
  ],
);

// 선제적 알림 스케줄 — navis가 정해진 시간에 깨어나 prompt를 실행해 앱 보고로 기록한다.
// 영속화는 namory(DB)가, 실제 스케줄링/전송은 navis(node-cron) 프로세스가 담당.
export const crons = pgTable("crons", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 사람이 읽는 라벨 (예: "매일 아침 주식 정리")
  title: text("title").notNull(),
  // node-cron 식 (예: "0 9 * * *")
  schedule: text("schedule").notNull(),
  // 스케줄 해석 타임존 (예: Asia/Seoul). 기본 한국시간.
  timezone: text("timezone").notNull().default("Asia/Seoul"),
  // 발동 시 navis가 실행할 지시문
  prompt: text("prompt").notNull(),
  // 비활성화하면 스케줄에서 제외 (삭제 대신 끄기)
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
});

// 자기 이해 누적 — 단일 사용자라 섹션별 1행 (values / patterns / goals ...)
export const profile = pgTable("profile", {
  section: text("section").primaryKey(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 앱에서 편집하는 일반 설정(key→value). 예: system_prompt(봇 성격).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// 대화방 동기화 — 앱/데스크톱이 기기 간 채팅을 맞추기 위한 서버 사본.
// id 는 클라이언트가 만든 방 id(uuid 아님)라 text PK. messages 는 통째 jsonb.
// 머지는 방 단위 Last-Write-Wins(updatedAt), 삭제는 deletedAt 툼스톤으로 전파.
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull(), // 'chat' | 'report'
  messages: jsonb("messages").notNull(),
  sessionId: text("session_id"),
  unread: integer("unread").notNull().default(0),
  hidden: boolean("hidden").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// 선제 보고(크론/다이제스트/캘린더) 로그. 앱이 폴링해 보고 전용 방에 표시한다.
//
// 예전에는 navis 프로세스의 인메모리 배열이었고 settings KV 한 칸에 JSON 블롭으로
// 디바운스 저장했다. 서버리스에서는 둘 다 성립하지 않는다: 인스턴스마다 배열이
// 따로라 크론이 쓴 보고가 앱 폴링을 받는 인스턴스에서 안 보이고, 디바운스 타이머는
// 응답 직후 인스턴스가 얼려져 발화하지 않아 보고가 유실된다. 또 블롭 read-modify-write
// 는 동시에 발동한 크론 둘이 서로를 덮어쓴다. 그래서 제대로 테이블로 만든다.
//
// sourceId/sourceTitle 로 "출처별 방"을 만든다. 크론은 크론마다 방 1개(sourceId=크론 id),
// 다이제스트/캘린더는 각각 고정 방.
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // logTag: "cron" | "calendar" | "digest" | ...
    type: text("type").notNull(),
    // 방 라우팅 키 (크론 id / "digest" / "calendar")
    sourceId: text("source_id").notNull(),
    // 방 제목 (DB 기반)
    sourceTitle: text("source_title").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // 앱 폴링은 항상 "since 이후, 시간순" — 이 인덱스 하나로 커버된다.
    index("reports_created_at_idx").on(t.createdAt.desc()),
    index("reports_source_id_idx").on(t.sourceId),
  ],
);

// 진행 중인 챗 턴에 대한 신호(중지/핸드오프). 수명이 짧은 제어 상태다.
//
// 예전엔 navis 프로세스의 Map/Set 이었다: inflight(AbortController), cancelled, handoff.
// AbortController 는 같은 프로세스 안의 생성만 끊을 수 있으니 그건 인스턴스 로컬로
// 남겨야 하지만, "중지를 눌렀다"·"백그라운드로 갔다"는 *의도*는 인스턴스를 넘어 전달돼야
// 한다. 서버리스에서 /api/chat/cancel 은 스트림을 돌리는 인스턴스와 다른 인스턴스로
// 가는 게 보통이라, 인메모리 Set 이면 중지 버튼이 조용히 무동작이 된다.
//
// 그래서 의도만 이 테이블에 적고, 스트림을 돌리는 인스턴스가 짧은 주기로 읽어 자기
// AbortController 를 끊는다. 행은 소비 시 삭제하고, 남은 것은 스케줄러 틱이 쓸어낸다.
export const turnSignals = pgTable(
  "turn_signals",
  {
    // 클라이언트가 만든 턴 id + 신호 종류의 조합이 키.
    turnId: text("turn_id").notNull(),
    kind: text("kind").notNull(), // 'cancel' | 'handoff'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.turnId, t.kind] }),
    // 소비되지 않고 남은 행 청소용(틱에서 오래된 것 삭제).
    index("turn_signals_created_at_idx").on(t.createdAt),
  ],
);
