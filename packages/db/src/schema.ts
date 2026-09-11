import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  vector,
  index,
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
    index("memories_created_at_idx").on(t.createdAt.desc()),
    index("memories_category_idx").on(t.category),
    index("memories_project_idx").on(t.project),
  ],
);

// 대화방. 클라이언트가 만든 방 id 라 text PK, messages 는 통째 jsonb.
//
// 예전엔 여기에 kind/unread/hidden/deletedAt 이 있었다 — 전부 여러 기기 간
// Last-Write-Wins 동기화와 보고방 때문이었다. 클라이언트가 하나이고 서버가
// 권위를 가지면 필요 없다.
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    messages: jsonb("messages").notNull().default([]),
    // 이어갈 에이전트 세션 id — 방마다 맥락을 분리한다.
    sessionId: text("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("conversations_updated_at_idx").on(t.updatedAt.desc())],
);

// key→value 설정. 지금은 시스템 프롬프트(봇 성격) 보관용.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
