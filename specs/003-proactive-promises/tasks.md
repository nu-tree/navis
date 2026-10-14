---
description: "먼저 말 거는 나비스 — 약속 작업 목록"
---

# Tasks: 먼저 말 거는 나비스 — 약속

**Input**: `specs/003-proactive-promises/` 의 spec.md · plan.md · research.md · data-model.md · contracts/ · quickstart.md

**Tests**: 포함한다. 결정적인 것만 덮는다(헌장 품질 게이트):
- 일정 검증 · 다음 회차 · 세션 교체 판정 · 메시지 매핑(순수 함수)
- 선점 · 분리 · 메시지 이전(실 Postgres, `DATABASE_URL` 없으면 skip — `packages/domain/test/conversation/index.test.ts` 방식)
- 서버 계약(`app.fetch()`)

모델 판단이 섞인 것(침묵 · 제안)은 quickstart 수동 시나리오로 확인한다.

**Organization**: 스토리별 단계.
- US1 · US2(P1)를 먼저 한다. P2 는 US5 → US4 → US3 순이다. US5 의 성능 작업이 메인 방을 실제로 쓰기 전에
  있어야 하고, US3 은 지침 몇 줄이라 마지막에 둔다.
- 회원 id 는 언제나 **첫 인자 `userId: string`** 이다(specs/002).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일 · 앞 작업 의존 없음 → 병렬 가능
- **[Story]**: US1~US5 (spec.md 의 사용자 스토리)

---

## Phase 1: Setup

- [X] T001 `.specify/memory/constitution.md` 를 v2.1.0 으로 개정한다(research R12, FR-030). **다른 모든 작업의 선행 조건이며 단독 커밋**이다.
  - **원칙 I**: "의도적으로 제거된 기능" 목록에서 크론 · 알림을 뺀다. "약속 — 나비스가 나중의 자기에게 거는 대화"를 대화의 일부로 적는다. "고정 능동 기능(브리핑 · 리마인더 같은 종류별 기능)을 코드로 만들지 않는다"를 덧붙인다. 웹 푸시(f561eba)가 이 개정으로 근거를 얻는다고 적는다.
  - **보안 절**: `/internal/tick` 은 `NAVIS_TICK_TOKEN` 전용, 외부 MCP 에 약속 도구 금지, 허용 MCP 서버 `memory` · `promise` · `promise_run` 을 적는다.
  - **성능 절**: tick 은 모델을 부르지 않는다. 약속 턴은 직렬이고 같은 회원 대화에 양보한다. 목록 · 메시지는 jsonb 배열을 통째로 읽거나 쓰지 않는다. 긴 방은 세션을 교체한다.
  - **배포 절**: server 비밀값에 `NAVIS_TICK_TOKEN` 을 추가하고 Cloud Scheduler 작업 1개를 둔다.
  - `Version 2.1.0`, `Last Amended 2026-10-14` 로 바꾼다.
- [X] T002 [P] `packages/domain/package.json` 에 `cron-parser` 를 **정확한 버전으로**(캐럿 없이) 추가하고 `pnpm install` 한다(research R6). 설치한 버전이 `CronExpressionParser.parse(expr, { tz: "Asia/Seoul", currentDate })` 형태를 지원하는지 `node_modules/cron-parser` 의 타입으로 확인한다.
- [X] T003 [P] `apps/server/src/env.ts` 에 `tickToken: process.env.NAVIS_TICK_TOKEN || null` 을 추가한다. 값이 `API_TOKEN` 이나 `NAVIS_MCP_TOKEN` 과 같으면 부팅을 throw 로 막는다(`mcpToken` 검사와 같은 방식). `apps/server/.env.example` 에 설명과 함께 `NAVIS_TICK_TOKEN=` 을 추가한다("Cloud Scheduler 가 /internal/tick 을 부를 때 쓰는 토큰. 다른 토큰과 다른 값. 없으면 tick 이 닫힌다").

---

## Phase 2: Foundational (모든 스토리의 전제)

**⚠️ 이 단계가 끝나기 전에는 어느 스토리도 시작하지 않는다.** 메시지 표 이전(R7)과 메인 방의 최소 형태(R9)가 여기 있다. 이 단계만으로 배포 · 검증할 수 있다(quickstart S0).

### 스키마 · 계약

- [X] T004 `packages/db/src/schema.ts` 에 data-model.md 그대로 추가한다.
  - **`messages`**: `id uuid PK`, `seq bigint generated always as identity`, `conversation_id text not null → conversations.id ON DELETE CASCADE`, `user_id uuid not null`, `role text not null`(`user` | `assistant`), `text text not null`, `meta jsonb not null default '{}'`, `created_at timestamptz not null`. 인덱스 `messages_conversation_seq_idx (conversation_id, seq desc)`.
  - **`promises`**: 모든 열은 data-model.md 표 그대로다. `CHECK`: `schedule_kind = 'once'` ⇔ `run_at not null and cron is null`. 인덱스 `promises_due_idx (next_run_at) WHERE enabled`, `promises_user_idx (user_id, next_run_at)`.
  - **`promise_runs`**: `promise_id → promises.id ON DELETE CASCADE`, `status` ∈ `running|spoke|silent|failed`. 인덱스 `(promise_id, started_at desc)`.
  - **`conversations`** 에 `is_main boolean not null default false` 와 `session_turns int not null default 0` 을 추가하고, 부분 유일 인덱스 `conversations_user_main_idx (user_id) WHERE is_main` 을 만든다.
  - 이 단계에서는 `conversations.messages` 를 **지우지 않는다**(T013).
- [X] T005 `pnpm db:generate` 로 `packages/db/migrations/0011_*.sql` 을 만들고, 생성된 SQL 끝에 **백필**을 손으로 덧붙인다.
  - `INSERT INTO messages (id, conversation_id, user_id, role, text, meta, created_at) SELECT … FROM conversations c, jsonb_array_elements(c.messages) WITH ORDINALITY AS e(m, ord) ORDER BY c.id, ord`
  - `id` 는 `(m->>'id')::uuid` 를 쓰고, uuid 가 아닌 옛 id 는 `gen_random_uuid()` 로 바꾼다.
  - `meta` 는 `toolsUsed` · `saved` 만 담는다. `images` 는 버린다.
  - `created_at` 은 `(m->>'createdAt')::timestamptz` 다.
  - 로컬 DB 에 `pnpm db:migrate` 로 적용하고 방별 개수가 같은지 SQL 로 대조한다.
- [X] T006 [P] `packages/validation/src/conversation.ts` 를 바꾼다.
  - `messageSchema` 에 `origin: z.object({ kind: z.enum(["promise","promise-disabled"]), promiseId: z.string(), label: z.string() }).optional()` 를 추가한다.
  - `conversationSchema` 에 `isMain: z.boolean()` 과 `hasMore: z.boolean()` 을 추가한다. `messages` 는 "최근 50개, 오래된 → 최근 순" 주석으로 바꾼다.
  - `conversationSummarySchema` 에서 `messageCount` 를 빼고 `isMain` 을 더한다.
  - `messagePageSchema = z.object({ messages: z.array(messageSchema), hasMore: z.boolean() })` 를 export 한다.
- [X] T007 [P] `packages/validation/src/promise.ts` 를 새로 만들고 `index.ts` 에서 export 한다. contracts/http.md 의 `Promise` 와이어 형태와 contracts/promise-tools.md 의 도구 입력을 그대로 옮긴다.
  - 도구 입력 제약: `instruction` 1..1000, `label` 1..40, `schedule` 은 `{ at: ISO 오프셋 필수 }` | `{ cron: string }`, `notify.text` 1..4000, `set_memo.memo` 0..2000, `finish.reason` 1..200.
  - `promisePatchSchema = z.object({ enabled: z.boolean() })`.

### 대화방 도메인 — messages 표로 재작성

- [X] T008 `packages/domain/src/conversation/index.ts` 를 messages 표 기준으로 다시 쓴다(contracts/http.md "대화방 — 변경").
  - `list`: `ensureMain` 후, 마지막 메시지는 `(conversation_id, seq desc)` 로 한 행만 읽는 lateral 또는 서브쿼리로 가져온다. 정렬은 `is_main desc, updated_at desc` 이고 `messageCount` 는 뺀다.
  - `get(userId, id)`: 최근 50개를 오래된 → 최근 순으로 담고 `hasMore` · `isMain` 을 붙인다.
  - `page(userId, id, beforeMessageId, limit≤100)`: 없는 `before` 는 NotFoundError 다.
  - `recentForHistory(userId, id, 20)`
  - `appendMessage`: 한 행 INSERT 와 `conversations.updated_at` 갱신을 한 트랜잭션에서 한다. 남의 방이면 NotFoundError 다.
  - `removeMessage`: 행 DELETE.
  - `meta` ↔ `toolsUsed` · `saved` · `origin` 매핑은 순수 함수 `toMessage` · `toMeta` 로 분리한다.
  - `ensure` 는 그대로 둔다(messages 열은 빈 배열 기본값 유지).
- [X] T009 `packages/domain/src/conversation/index.ts` 에 메인 방을 추가한다(research R9).
  - `ensureMain(userId): Promise<{ id: string }>`: `INSERT … (id=randomUUID(), title="나비스", is_main=true) ON CONFLICT DO NOTHING` 한 뒤 SELECT 한다. 부분 유일 인덱스가 회원당 하나를 보장한다.
  - `remove` 는 메인 방이면 `MainRoomUndeletableError` 를 던진다. 이 에러는 `packages/domain/src/errors.ts` 에 타입 있는 에러로 추가한다.
- [X] T010 [P] `packages/domain/test/conversation/index.test.ts` 를 새 구현에 맞게 고치고 늘린다(실 DB).
  - append 한 순서대로 페이지가 나온다.
  - 120개를 넣고 get 하면 50개와 `hasMore=true`, `page(before)` 로 이어 받으면 중복 · 누락이 없다.
  - list 의 `lastMessage` 가 맞다.
  - `ensureMain` 은 두 번 불러도 하나다.
  - 메인 방 remove 는 `MainRoomUndeletableError` 다.
  - USER_B 는 USER_A 의 방을 page · append 할 수 없다(NotFoundError).
- [X] T011 `packages/api/src/client.ts` 에 `conversations.page(id, before, limit)` 를 추가하고 `conversations.list` · `get` 반환 타입을 새 스키마로 맞춘다. `apps/server/src/routes/conversations.ts` 를 바꾼다.
  - `GET /:id/messages?before=&limit=` 를 추가한다(limit 기본 50, 최대 100, 잘못된 값은 400).
  - `DELETE /:id` 에서 `MainRoomUndeletableError` 를 **409** `{ error: "나비스 방은 지울 수 없어요." }` 로 바꾼다.
- [X] T012 [P] `apps/server/test/routes/conversations.test.ts` 에 계약을 추가한다(domain mock): 페이지 라우트 200 · 400(limit=0, 101) · 404, 메인 방 삭제 409, 목록 응답에 `messageCount` 없음 · `isMain` 있음.
- [ ] T013 **(운영 S0 대조 뒤로 미룸 — T052 6단계 다음)** `packages/db/migrations/0012_*.sql` 로 `conversations.messages` 열을 제거한다. 미리 만들어 두면 운영 `db:migrate` 한 번에 0011 과 열 삭제가 함께 적용돼 대조할 틈이 없고, 배포 전 옛 코드가 쓰기에 실패한다. 그래서 S0 확인 뒤에 만들고 바로 적용한다. `schema.ts` 에서 열 정의를 지우고, `ensure` 의 `messages: []` 를 뺀다. `packages/db/migrations/meta` 의 생성 순서를 지킨다.

### 대화 턴 — 기록 · 세션 · 레지스트리

- [X] T014 `apps/server/src/turns.ts` 를 새로 만든다(research R4). `routes/chat.ts` 의 `activeConversations: Set` 을 이 모듈로 옮겨 회원을 함께 기록한다.
  - `begin(conversationId, userId)`: 같은 방이 진행 중이면 false.
  - `end(conversationId)`
  - `isUserBusy(userId)`
  - `waitUntilIdle(userId, timeoutMs)`: 진행 중 턴이 끝나면 풀리는 프라미스, 타임아웃이면 그냥 풀린다.
  - 상태는 Map 하나에 둔다. `let` 을 추가하지 않는다.
- [X] T015 `apps/server/src/routes/chat.ts` 를 바꾼다.
  - `turns` 레지스트리를 쓴다.
  - `history` 는 `conversation.recentForHistory(userId, id, 20)` 으로 읽는다(방 전체를 싣지 않는다).
  - 세션 교체(R8): `room.sessionTurns >= 30` 이면 `resumeSessionId` 를 넘기지 않는다. 턴이 끝나면 이어 썼으면 `session_turns + 1`, 새 세션이면 1 로 `conversation.setSessionId(userId, id, sessionId, turns)` 를 부른다. 시그니처를 확장한다.
  - 판정은 순수 함수 `shouldStartFreshSession(room)` 으로 `packages/domain/src/conversation/index.ts` 에 둔다.
- [X] T016 `packages/domain/src/chat/index.ts` · `history.ts`: 기록 이어 붙이기 조건을 `!resume && resumeSessionId && history.length` 에서 `!resume && history.length > 0` 으로 바꾼다(R8). 세션이 비워진 방(약속 메시지 이후)도 맥락을 잇기 위해서다. `packages/domain/test/chat/history.test.ts` 에 해당 경우를 추가한다.
- [X] T017 [P] `packages/domain/test/conversation/session.test.ts`: `shouldStartFreshSession` 을 검증한다. 29턴 이어 씀, 30턴 교체, `sessionId` null 교체.

### web — 페이지네이션 · 메인 방 기본 선택

- [X] T018 `apps/web/src/app/api/conversations/[id]/messages/route.ts`(GET BFF, `proxyToServer`)를 만든다. *(구현 메모: infinite query 대신 캐시 형태 `Message[]` 를 유지하고 `use-load-older-messages.ts` 가 앞에 붙인다 — 보내기 · 지우기 쪽 캐시 코드를 건드리지 않으려고.)* `apps/web/src/hooks/apis/conversation/use-conversation-message-list.ts` 를 `useInfiniteQuery` 로 바꾼다.
  - 첫 페이지는 `GET /api/conversations/:id`, 이전 페이지는 `before=<가장 오래된 id>` 로 받는다.
  - `staleTime 0` 과 `refetchOnWindowFocus false` 는 유지한다.
  - `use-chat.ts` 가 캐시에 직접 쓰는 부분을 infinite 데이터 형태(`pages[last].messages` 에 추가)로 맞춘다.
- [X] T019 `apps/web/src/features/chat/message-list.tsx` 를 바꾼다. 맨 위에 닿으면 훅의 `fetchPreviousPage` 를 부르고, 불러온 뒤 스크롤 위치를 유지한다. 판단은 훅(`use-stick-to-bottom` 옆 새 훅 `use-load-older.ts`)이 하고 컴포넌트는 렌더만 한다(원칙 III).
- [X] T020 `apps/web/src/hooks/pages/conversation/use-conversation-workspace.ts` 를 바꾼다. `?c=` 가 없으면 첫 화면을 새 초안 대신 목록의 `isMain` 방으로 연다(목록이 오기 전에는 초안). "새 대화"는 지금처럼 초안을 만든다. `apps/web/src/components/layout/sidebar.tsx` 에서는 메인 방에 삭제 버튼을 보이지 않고, 고정 표시(핀 아이콘)를 붙인다.

**Checkpoint**: 약속 없이도 배포할 수 있다. quickstart S0(이전 대조) · S7(메인 방) · S8(긴 방) 일부를 확인할 수 있다.

---

## Phase 3: User Story 1 — 말해 둔 때에 나비스가 먼저 말을 건다 (P1) 🎯 MVP

**Goal**: 한 번짜리 약속을 대화로 만들고, 시각이 되면 메인 방에 나비스가 먼저 말을 건다. 알림도 온다.

**Independent Test**: quickstart S1 — "2분 뒤에 물 마셨는지 물어봐줘" → 창 닫기 → 3분 안에 알림 → 메인 방에 나비스가 먼저 쓴 메시지(출처 표시 없음) → 답하면 이어진다.

### 테스트

- [X] T021 [P] [US1] `packages/domain/test/promise/schedule.test.ts`(순수): 한 번짜리 약속의 검증과 다음 회차를 검증한다.
  - 과거 시각은 거절한다.
  - 오프셋 없는 ISO 는 거절한다.
  - 미래 시각은 `nextRun = at` 이고, 실행 후 다음 회차는 없다.
  - 사람이 읽는 표기는 "10월 15일(수) 15:00" 처럼 KST 다.
- [ ] T022 [P] [US1] `packages/domain/test/promise/claim.test.ts`(실 DB): 선점을 검증한다(R3).
  - 기한이 된 약속만 집힌다.
  - 두 번 동시에 `claimDue()` 를 불러도 같은 약속은 한 번만 나온다(`Promise.all`).
  - `lease_until` 이 미래면 안 집힌다.
  - 임대가 만료된 `running` 실행은 `failed` 로 닫히고 다시 집힌다.
  - `LIMIT 5` 를 지킨다.
- [ ] T023 [P] [US1] `apps/server/test/routes/internal.test.ts`(계약, domain · runner mock): tick 자격을 검증한다(R10).
  - 토큰 미설정이면 404.
  - 토큰이 없거나 `API_TOKEN` 이거나 MCP 토큰이면 401.
  - 맞는 토큰이면 200 `{ claimed, results }`.
  - 이 토큰으로 `/conversations` 를 부르면 401(범위가 새지 않는다).

### 구현

- [X] T024 [P] [US1] `packages/domain/src/promise/schedule.ts`(순수)를 만든다.
  - `validateSchedule(input, now)` → `{ kind, runAt | cron }` 또는 `ScheduleInvalidError`(errors.ts 에 추가, 이유 문구 포함).
  - `nextRunAfter(schedule, after)`: 놓친 회차를 건너뛰고 `after` 이후 첫 회차다.
  - `upcoming(schedule, now, 3)`
  - `describe(schedule)`: 사람이 읽는 KST 표기다.
  - 이 단계에서는 한 번짜리 갈래만 구현한다. cron 갈래는 US2(T033)에서 하고, 지금은 `ScheduleInvalidError("반복 약속은 아직 지원하지 않아요")` 를 던진다.
- [X] T025 [US1] `packages/domain/src/promise/index.ts` 를 만든다. CRUD 와 실행 상태를 다룬다.
  - CRUD: `create(userId, input, originConversationId)`(켜진 약속 **회원당 최대 20개** → `PromiseLimitError`), `list(userId, { includeEnded })`(최근 실행 3개 포함), `get` · `setEnabled` · `remove`(모두 회원으로 좁힘, 남의 것은 NotFoundError).
  - 실행 상태 함수:
    - `claimDue(limit=5)`: 한 트랜잭션에서 `SELECT … FOR UPDATE SKIP LOCKED` → `lease_until = now()+15분`, `promise_runs` 에 `running` 을 INSERT 한다. 시작 전에 임대가 만료된 `running` 을 `failed("서버가 실행 중에 멈췄어요")` 로 닫는다.
    - `complete(runId, outcome)`: `next_run_at = nextRunAfter(now)`, 한 번짜리는 `enabled=false` · `ended_at`, `last_run_at`, `memo`, `consecutive_failures` 를 쓰고 `lease_until = null` 로 만든다. 약속마다 `promise_runs` 를 최근 20개만 남긴다.
- [X] T026 [US1] `packages/domain/src/promise/mcp.ts` 를 만든다. 서버 둘(contracts/promise-tools.md).
  - `createPromiseMcpServer({ userId, conversationId })`: `create` · `list` · `update` · `cancel`. 응답에 다음 3회차와 id 를 싣는다.
  - `createPromiseRunMcpServer({ userId, promise, run, state })`: `notify`(실행당 1회, 두 번째는 isError) · `set_memo` · `finish`.
  - `notify` 는 `conversation.ensureMain` → `appendMessage(role "assistant", origin { kind "promise", promiseId, label })` 를 부르고, 메인 방 `session_id = null` · `session_turns = 0` 으로 만든다. 그다음 `push.notify(userId, { title: "나비스", body: push.excerpt(text), conversationId: mainId })` 를 기다리지 않고 보낸다. 결과는 `state` 에 기록한다(spoke, messageId).
  - `ALLOWED_PROMISE_TOOLS` · `ALLOWED_PROMISE_RUN_TOOLS` 를 export 한다.
- [X] T027 [US1] `packages/domain/src/chat/index.ts` 를 리팩터링한다.
  - query 옵션 조립(토큰 · 도구 · canUseTool · env · 오류 분류 · 글 모으기)을 내부 함수 하나로 모으고, 그 위에 `runTurn`(대화)과 `runPromiseTurn`(약속)을 둔다.
  - `runTurn` 은 `mcpServers` 에 `promise` 서버를 추가하고 `allowedTools` 에 `ALLOWED_PROMISE_TOOLS` 를 더한다.
  - `runPromiseTurn({ userId, promise, run, history })`: resume 없음, 콜백 없음, 기억 · 웹 · `promise_run` 도구. 프롬프트는 research R5 블록(지시 · 메모 · 예정 · 지금(KST) · 지난 실행)이고 `withHistory` 로 메인 방 최근 20개를 앞에 붙인다.
  - `SYSTEM_PROMPT` 에 "## 약속" 절을 넣고, 약속 턴에는 "## 약속 실행" 절을 덧붙인다(contracts/promise-tools.md 문구).
- [X] T028 [US1] `packages/domain/src/promise/run.ts` 를 만든다. `executeRun(claimed)`: 메인 방 최근 20개를 읽고 `chat.runPromiseTurn` 을 실행한 뒤 결과를 분류한다. `notify` 를 불렀으면 `spoke`, 아니면 `silent`, 예외면 `failed`(토큰 오류는 err.message 를 그대로 쓴다). 마지막에 `promise.complete` 를 부른다. 예외를 밖으로 던지지 않는다. `packages/domain/src/index.ts` 에서 `promise` 네임스페이스로 export 한다.
- [X] T029 [US1] `apps/server/src/promise-runner.ts` 를 만든다. 직렬 큐다(R4).
  - `enqueue(claimed): Promise<RunResult>`: 실행 직전에 `turns.waitUntilIdle(userId, 10분)` → `promise.executeRun`.
  - 직렬화는 프라미스 체인 누산기 `let tail` 하나로 한다. 헌장 IV 가 허용하는 예외이며 근거 주석을 단다.
  - `stopAccepting()`: `process.on("SIGTERM")` 에서 부른다(`apps/server/src/index.ts`). 이후 tick 은 새로 선점하지 않는다(research R3).
- [X] T030 [US1] `apps/server/src/routes/internal.ts` 와 `apps/server/src/app.ts` 를 바꾼다.
  - 기본 잠금에 `/internal/tick` 갈래를 `/mcp` 처럼 둔다. `env.tickToken` 이 없으면 404, 있으면 그 토큰의 bearerAuth 만 쓴다. 회원 헤더는 보지 않는다.
  - `POST /internal/tick`: `runner.accepting` 이 아니면 `{ claimed: 0 }`, 아니면 `promise.claimDue(5)` → 각 항목을 `runner.enqueue` 하고 **모두 끝날 때까지 기다린 뒤** 응답한다(R2).
  - 라우트 목록 주석을 갱신한다.
- [X] T031 [US1] `apps/web/src/app/api/internal/tick/route.ts` 를 만든다. `/api/mcp` 와 같은 중계로 POST 만 받는다. `authorization` 헤더만 넘기고 세션 · web 토큰을 붙이지 않는다. 응답 본문은 그대로 넘긴다. `export const maxDuration` 등 Next 라우트 시간 제한이 30분 요청을 끊지 않는지 `node_modules/next/dist/docs/` 에서 확인하고 필요하면 설정한다.
- [X] T032 [US1] ~~말풍선 출처 표시~~ — **하지 않는다**(2026-10-14 사용자 결정). 약속 메시지도 평소 나비스 답과 똑같이 보인다. `origin` 은 데이터에만 남는다.

**Checkpoint**: 로컬 tick 루프(quickstart 준비 3)로 S1 · S11 · S15 · S16 을 통과한다.

---

## Phase 4: User Story 2 — 반복 약속과 "말할 게 없으면 침묵" (P1)

**Goal**: cron 반복 약속, 메모로 반복 알림 방지, 스스로 끝내기, 최소 간격, 연속 실패 처리.

**Independent Test**: quickstart S2(짝수 시만 말하기) · S3(한 번만 알리기) · S4(최소 간격 · 상한) · S13(실패 3회 → 꺼짐).

- [X] T033 [P] [US2] `packages/domain/test/promise/schedule.test.ts` 에 cron 을 추가한다.
  - `0 21 * * *` 의 다음 회차가 KST 21:00 이다(UTC 12:00).
  - `*/30 * * * *` 는 간격 1시간 미만이라 거절하고, 이유에 제안 일정이 있다.
  - `0 * * * *` 는 통과한다.
  - 놓친 회차 3개가 있어도 `nextRunAfter(now)` 는 미래 첫 회차 하나다.
  - 잘못된 식은 거절한다.
- [X] T034 [US2] `packages/domain/src/promise/schedule.ts` 에 cron 갈래를 구현한다. `cron-parser`, `tz: "Asia/Seoul"`. 최소 간격은 다음 24회차의 인접 간격이 모두 1시간 이상인지로 검증한다(FR-005). `describe` 는 "매일 21:00" 처럼 흔한 형태를 사람 말로 바꾸고, 그 밖은 cron 원문과 다음 회차를 보여 준다. T024 의 임시 거절을 지운다.
- [ ] T035 [US2] `packages/domain/src/promise/index.ts` 의 `complete` 에 연속 실패 처리를 넣는다(R11). `failed` 면 `consecutive_failures + 1`, 아니면 0 이다. 반복 약속이 **연속 3회** 실패하면 `enabled=false`, `next_run_at=null` 로 만들고, 메인 방에 assistant 메시지 하나(`origin.kind = "promise-disabled"`, 본문 "'{label}' 약속이 세 번 연속 실패해서 껐어요. 이유: {마지막 error}")를 남긴 뒤 푸시를 보낸다. 한 번짜리 약속은 실패해도 끝남으로 둔다.
- [ ] T036 [P] [US2] `packages/domain/test/promise/claim.test.ts` 에 추가한다(실 DB).
  - 반복 약속을 complete 하면 `next_run_at` 이 미래 첫 회차다.
  - 3회 연속 failed 면 꺼지고 메인 방에 메시지 1개가 생긴다.
  - silent 사이에 낀 실패는 카운터를 리셋한다.
  - `finish` 도구 효과 뒤에는 complete 가 `enabled` 를 다시 켜지 않는다.
- [ ] T037 [US2] `packages/domain/src/promise/mcp.ts` 의 `set_memo` · `finish` 결과를 `executeRun` → `complete` 로 전달한다. 메모는 2,000자에서 자르지 않고 거절한다. 약속 턴 프롬프트의 "지난 실행" 줄에 직전 실행의 상태와 시각을 싣는다(`promise_runs` 최근 1개).

**Checkpoint**: S2 · S3 · S4 · S13 통과. US1 과 함께 P1 이 완성된다.

---

## Phase 5: User Story 5 — 늘 같은 자리의 "나비스" 방 (P2)

**Goal**: 메인 방이 길어져도 느려지지 않는다는 것을 확인하고 다듬는다. 고정 · 기본 열림 · 삭제 불가는 Phase 2 에 있다.

**Independent Test**: quickstart S7 · S8.

- [ ] T038 [P] [US5] `packages/db/scripts/seed-long-room.ts`(개발 전용, 운영 코드에서 import 하지 않음)를 만든다. 지정 회원의 메인 방에 메시지 N개(기본 500)를 넣는다. S8 측정용이다.
- [ ] T039 [US5] S8 을 측정하고 결과를 quickstart.md 표 아래 "실측" 절에 적는다. 첫 응답 시간(새 방 vs 500개 메인 방, 각 5회 중앙값)과 방 열기 시간이다. +20% 를 넘으면 원인(세션 교체 미적용 · 목록 쿼리)을 잡고 고친다.
- [ ] T040 [P] [US5] `apps/web/src/components/layout/sidebar.tsx`: 메인 방 항목에 핀 아이콘과 제목 "나비스"를 보이고, 다른 방과 구분선을 둔다. 방 이름 바꾸기 기능은 지금 없으므로 만들지 않는다(spec FR-021).

**Checkpoint**: S7 · S8 통과.

---

## Phase 6: User Story 4 — 약속을 보고 끄고 지운다 (P2)

**Goal**: 약속 화면(목록 · 켜기/끄기 · 지우기 · 최근 실행)과 대화로 하는 관리.

**Independent Test**: quickstart S6 · S14.

- [ ] T041 [P] [US4] `apps/server/test/routes/promises.test.ts`(계약, domain mock): `GET /promises` 200, `PATCH` `{enabled}` 200 · 400(본문 오류) · 404 · 422(`PromiseLimitError`), `DELETE` 204 · 404. 다른 회원 헤더로는 404 다.
- [ ] T042 [P] [US4] `packages/domain/test/promise/isolation.test.ts`(실 DB): USER_B 는 USER_A 의 약속을 get · setEnabled · remove 할 수 없다(NotFoundError). list 에도 나오지 않는다(SC-007). `setEnabled(true)` 는 상한 20 을 센다. 다시 켜면 `next_run_at` 이 지금 이후 첫 회차다(FR-016).
- [ ] T043 [US4] `apps/server/src/routes/promises.ts` 를 만들고 `app.ts` 에 등록한다. 검증 → domain → 직렬화만 한다. 에러는 종류로 status 를 정한다(NotFound 404, PromiseLimit 422).
- [ ] T044 [US4] `packages/api/src/client.ts` 에 `promises.list` · `setEnabled` · `remove` 를 추가한다. BFF `apps/web/src/app/api/promises/route.ts`(GET)와 `apps/web/src/app/api/promises/[id]/route.ts`(PATCH · DELETE)를 `proxyToServer` 로 만든다.
- [ ] T045 [P] [US4] 훅을 만든다. `apps/web/src/hooks/apis/promise/use-promise-list.ts` · `use-set-promise-enabled.ts` · `use-delete-promise.ts`(성공 시 목록 무효화).
- [ ] T046 [US4] 화면을 만든다. `apps/web/src/app/promises/page.tsx` + `apps/web/src/features/promise/promise-screen.tsx` · `promise-item.tsx`.
  - 다음 실행 순으로 보이고, 끝난 약속은 아래에 따로 둔다.
  - 항목에는 label, 일정 설명, 다음 실행, 마지막 실행, 최근 실행 3개(말함 · 조용 · 실패+이유)를 보인다. 켜기 스위치와 지우기(`components/common/confirm-delete-button.tsx`)를 둔다.
  - 빈 목록 문구: "대화에서 '내일 3시에 알려줘'처럼 말하면 약속이 생겨요."
  - 상태는 훅에서만 다룬다.
- [ ] T047 [US4] `apps/web/src/components/layout/sidebar.tsx` 에 기억 · 설정 옆으로 "약속" 링크를 추가한다. `apps/web/src/features/onboarding/tour-steps.ts` 에 약속 한 단계를 추가할지 검토한다. 추가하면 튜토리얼 버전을 올린다(`use-onboarding-seen`).

**Checkpoint**: S6 · S14 통과.

---

## Phase 7: User Story 3 — 나비스가 먼저 약속을 제안한다 (P2)

**Goal**: 날짜 걸린 계획에 한 문장 제안. 동의 없이 만들지 않는다.

**Independent Test**: quickstart S5.

- [ ] T048 [US3] `packages/domain/src/chat/index.ts` 의 "## 약속" 절에 제안 지침을 다듬는다(contracts/promise-tools.md).
  - 계획에 날짜 · 시각이 걸렸을 때만 제안한다.
  - 한 문장으로 한다.
  - 동의 없이 `create` 를 부르지 않는다.
  - 같은 대화에서 거절된 제안은 반복하지 않는다.
  - 인사 · 잡담에는 제안하지 않는다.

  `promise.create` 도구 설명문에도 "요청 또는 동의가 있을 때만"을 넣는다.
- [ ] T049 [US3] quickstart S5 를 수행하고 결과(제안 수 · 동의 없는 생성 0 · 인사에 대한 제안 0)를 quickstart.md "실측"에 적는다. 기준을 못 넘으면 T048 문구를 고쳐 다시 한다.

**Checkpoint**: S5 통과.

---

## Phase 8: Polish & 운영

- [ ] T050 `deploy/service.yaml`: server 컨테이너 env 에 `NAVIS_TICK_TOKEN` 을 Secret Manager `navis-tick-token` 에서 주입한다. **web 에는 넣지 않는다.** `deploy/README.md` 에 다음을 적는다.
  - 비밀값 생성(`openssl rand -base64 32`)
  - `gcloud services enable cloudscheduler.googleapis.com`
  - Scheduler 작업 생성 명령: `gcloud scheduler jobs create http navis-tick --location=asia-southeast1 --schedule="* * * * *" --uri=https://<서비스>/api/internal/tick --http-method=POST --headers="Authorization=Bearer <토큰>" --attempt-deadline=1800s --max-retry-attempts=0`
  - 간격을 5분으로 바꾸는 방법
  - 운영 순서(quickstart "운영")
- [ ] T051 Cloud Run 이 리비전 전환 때 처리 중인 요청을 끝까지 마치게 두는지 공식 문서로 확인하고, 결과를 research.md R3 에 출처와 함께 적는다. 아니라면 SIGTERM 처리(T029)를 "진행 중 실행을 failed 로 닫고 임대를 즉시 푼다"로 바꾼다.
- [ ] T052 운영 적용(사용자와 함께, 되돌리기 어려운 단계라 각 단계 전에 확인을 받는다).
  1. 비밀값 생성
  2. 운영 DB 0011
  3. main push 배포
  4. S0 대조
  5. Scheduler 작업 생성
  6. S1 운영 확인
  7. 0012 적용
- [ ] T053 quickstart S9(동시 실행 메모리)를 운영에서 측정한다. server 메모리가 1Gi 에 가까우면 `deploy/service.yaml` 의 server `memory` 를 1.5Gi 로 올리고 결과를 quickstart "실측"에 적는다.
- [ ] T054 [P] 1주일 운영 뒤 Cloud Run 하루 과금 인스턴스·초를 10/6~14 기준선(1,400~2,000)과 비교해 research R1 에 적는다(Cloud Monitoring `run.googleapis.com/container/billable_instance_time`). 무료 한도가 걱정되면 Scheduler 일정을 `*/5` 로 바꾼다.
- [ ] T055 `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm --filter @navis/web build` 를 통과시키고, `let` 추가가 T029 한 곳뿐인지 확인한다(헌장 IV). `README.md` 의 환경변수 표에 `NAVIS_TICK_TOKEN` 을 추가한다.

---

## Dependencies & Execution Order

```
T001 헌장 ──► Phase 2 (T004–T020) ──► US1 (T021–T032) ──► US2 (T033–T037)
                   │                        │
                   │                        ├──► US4 (T041–T047)   ┐
                   │                        └──► US3 (T048–T049)   ├─► Phase 8
                   └──► US5 (T038–T040) ────────────────────────────┘
```

- **T001 이 모든 것의 선행**이다(헌장 개정 절차).
- Phase 2 의 T004 → T005 → T008/T009 → T011, T015 순이다. T006 · T007 은 T004 와 병렬로 할 수 있다.
- US5 는 Phase 2 만 있으면 시작할 수 있다(측정 · 확인). US1 과 병렬로 해도 된다.
- US4 는 US1 의 `promise/index.ts`(T025)가 필요하다. US3 은 US1 의 시스템 프롬프트 절(T027)이 필요하다.
- US2 의 T034 는 T024 를 확장하고, T035 는 T025 를 확장한다. 같은 파일이라 순차로 한다.

## Parallel Examples

- **Phase 2**: T006(validation conversation) · T007(validation promise) · T017(session 테스트)를 동시에 한다.
- **US1**: T021 · T022 · T023(테스트 셋)과 T024(schedule.ts)를 동시에 한 뒤 T025 → T026 → T027 → T028 → T029 → T030 순으로 한다. T031 · T032(web)는 T030 과 병렬로 한다.
- **US4**: T041 · T042 · T045 를 동시에 한다.

## Implementation Strategy

1. **T001 → Phase 2 를 먼저 배포한다.** 메시지 표 이전은 약속 없이도 가치가 있다. 메인 방이 생기고 긴 방이 빨라진다. 그래서 따로 내보내 S0 로 데이터를 확인한다. 0012 는 확인 뒤다.
2. **MVP = US1.** 한 번짜리 약속 하나가 메인 방에 도착하면 "먼저 말 거는 비서"를 체감할 수 있다. 여기서 써 보고 메인 방 중심 UI 개편(범위 밖) 판단 자료를 모은다.
3. **US2 로 P1 을 완성한다.** 반복 · 침묵 · 메모가 있어야 소음 없는 비서가 된다.
4. US5 측정 → US4 화면 → US3 지침 순으로 다듬는다. Phase 8 은 운영 단계라 사용자와 함께 한다.
