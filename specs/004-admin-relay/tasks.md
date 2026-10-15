---

description: "Task list — 관리자가 나비스를 통해 회원에게 말 걸기(전하기)"
---

# Tasks: 관리자가 나비스를 통해 회원에게 말 걸기 — 전하기

**Input**: Design documents from `/specs/004-admin-relay/`

**Prerequisites**: plan.md, spec.md, research.md(R1–R10), data-model.md, contracts/http.md, contracts/relay-tools.md, quickstart.md

**Tests**: 포함한다. 헌장 품질 게이트대로 결정적인 것만 — domain 순수 함수 · 실제 DB, server `app.fetch()` 계약. 모델 판단은 quickstart 수동 시나리오(M1–M12).

**Organization**: 스토리별 단계. US1 이 MVP 다. US2 · US3 는 US1 의 저장 · 실행 위에 입구 · 화면만 더한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일 · 미완료 작업에 의존하지 않아 병렬 가능
- **[Story]**: US1 · US2 · US3

---

## Phase 1: Setup

- [X] T001 `.specify/memory/constitution.md` 를 v2.2.0 으로 개정한다(plan Constitution Check, FR-020). **다른 모든 작업의 선행 조건이며 단독 커밋**이다.
  - 원칙 I: "**전하기는 대화다.** (v2.2.0 — specs/004-admin-relay) 관리자가 다른 회원의 나비스에게 지시 하나를 맡기면, 그 회원의 나비스가 그 회원의 맥락으로 한 마디를 전한다. 약속과 같은 실행 부품을 쓰고 종류별 기능이 아니다." 항목 추가.
  - 원칙 II 회원 격리: "모든 행은 한 회원의 것" 아래에 예외 한 줄 — "관리자의 전하기만 받는 회원 '나비스' 방에 메시지 한 개를 남길 수 있다. 관리자는 받는 회원의 다른 행을 읽지 않는다."
  - 원칙 II 또는 보안 절: "턴은 그 회원의 Claude 토큰으로만 돈다. 예외는 전하기 턴 하나 — 보낸 관리자의 토큰으로 돈다(FR-022). 받는 회원의 답장 턴은 받는 회원의 토큰이다."
  - 보안 절 "in-process MCP 서버는 셋뿐" → 다섯: `relay`(관리자 대화 턴에만 — `relay`), `relay_run`(전하기 턴 전용 — `deliver`). 외부 MCP 에는 열지 않는다.
  - 원칙 I "기능을 더하는 PR" 답: 전하기 = 대화.
  - 버전 · `Last Amended: 2026-10-15` 갱신.

---

## Phase 2: Foundational (모든 스토리의 전제)

### 스키마 · 계약

- [X] T002 `packages/db/src/schema.ts` 에 `relays` 표를 data-model.md 그대로 추가한다. 열: `id uuid PK`, `sender_id uuid NOT NULL`, `recipient_id uuid NOT NULL`, `recipient_label text NOT NULL`, `instruction text NOT NULL`, `status text NOT NULL`("`pending` · `running` · `delivered` · `failed`"), `error text NULL`, `message_id uuid NULL`, `lease_until timestamptz NULL`, `created_at timestamptz NOT NULL default now()`, `finished_at timestamptz NULL`. 인덱스 `relays_pending_idx`(`created_at`, where `status in ('pending','running')`), `relays_sender_created_idx`(`sender_id`, `created_at desc`). **외래 키를 걸지 않는다**(회원은 다른 스키마, 방이 지워져도 기록은 남는다) — 이유를 주석으로.
- [X] T003 `pnpm db:generate` 로 `packages/db/migrations/0012_*.sql` 을 만들고 내용을 확인한다(`auth` 스키마를 건드리지 않는지). 로컬에 `pnpm db:migrate`.
- [X] T004 [P] `packages/validation/src/relay.ts` 를 새로 만들고 `index.ts` 에서 export 한다(data-model.md "validation"):
  - `relayCreateInputSchema` `{ recipientId: uuid, instruction: string(1..1000, trim) }`
  - `relayToolInputSchema` `{ to: string(1..200), instruction: string(1..1000) }`
  - `relayDeliverInputSchema` `{ text: string(1..4000) }`
  - `relayStatusSchema` enum `pending|running|delivered|failed`, `relayItemSchema` `{ id, to, instruction, status, error: string|null, createdAt, finishedAt: string|null }` — **`messageId` 없음**(FR-019)
  - `memberSchema` `{ id: uuid, label: string }`
  - `zod` 외 의존을 들이지 않는다(원칙 II).

### 실행 기반 — 토큰 주인 · 전달 메타 · 와이어 은닉

- [X] T005 `packages/domain/src/chat/index.ts` 의 `TurnInput` 에 `tokenUserId?: string` 를 더하고 `claudeToken.resolve(input.tokenUserId ?? input.userId)` 로 바꾼다(research R3). 기존 "다른 회원의 토큰으로 대신 답하지 않는다(specs/002 FR-111)" 주석을 "예외: 전하기 턴은 보낸 관리자의 토큰(specs/004 FR-022). 기억 · 기록은 여전히 userId 의 것"으로 고친다.
- [X] T006 `packages/domain/src/promise/deliver.ts` 의 `deliver(userId, origin, text)` 를 `deliver(userId, meta, text)` 로 넓힌다. `meta` 는 `{ origin: MessageOrigin } | { relayId: string }`. 푸시 본문 대체값(`origin.label`)은 relay 일 때 빈 문자열 대신 `"나비스"` 로. 기존 호출부(`promise/mcp.ts` notify, `promise/run.ts` 연속 실패 알림)를 `{ origin: … }` 로 고친다.
- [X] T007 `packages/domain/src/conversation/index.ts` 의 내부 `MessageMeta` 에 `relayId?: string` 를 더한다(저장). 행 → 와이어 `Message` 매핑(`toMessage` 류, 52 · 60행 부근)에서 `relayId` 를 **싣지 않는다**(research R8). `appendMessage` 가 `relayId` 를 받아 meta 에 쓰게 한다.
- [X] T008 [P] `packages/domain/test/conversation/index.test.ts`(실 DB)에 추가: `relayId` 로 넣은 메시지가 DB `meta.relayId` 에는 있고, 목록 · 페이지 응답의 `Message` 에는 `relayId` · `origin` 키가 없다.

**Checkpoint**: 기존 `pnpm test` 가 모두 통과한다(약속 경로 회귀 없음).

---

## Phase 3: User Story 1 — 관리자 화면에서 회원에게 전한다 (P1) 🎯 MVP

**Goal**: 관리자가 화면에서 회원 · 지시를 보내면 1–2분 안에 그 회원 "나비스" 방에 나비스 말로 도착하고 알림이 간다. 관리자 토큰으로 돈다.

**Independent Test**: quickstart M1–M6 · M10 · M11 · M12.

### 테스트

- [X] T009 [P] [US1] `packages/domain/test/member/match.test.ts`(순수): `matchMember(members, to)` — 이메일 완전 일치, 로컬 부분(`@` 앞) 일치, 로컬 부분이 `to` 를 포함, 대소문자 무시, 앞 단계에서 하나면 멈춤, 0건 → `{ kind: "none" }`, 여럿 → `{ kind: "ambiguous", candidates }`, 하나 → `{ kind: "one", member }`.
- [X] T010 [P] [US1] `packages/domain/test/relay/index.test.ts`(실 DB, `test-users.ts` 사용):
  - `create` — 보낸 관리자의 토큰이 없으면 `ClaudeTokenMissingError`, 행이 생기지 않는다. 있으면 `pending` 행, 반환 `RelayItem` 에 `messageId` 없음.
  - `create` — 같은 `sender_id` 의 끝난 행이 50개를 넘으면 오래된 것부터 지운다. `pending` · `running` 은 지우지 않는다.
  - `claimPending(limit)` — 같은 행을 두 번 집지 않는다(동시 두 호출), `running` 으로 바꾸고 `lease_until` 을 건다, `lease_until` 이 지난 `running` 은 다시 집지 않고 `failed`("서버가 실행 중에 멈췄어요.")로 닫는다, `delivered` · `failed` 는 집지 않는다.
  - `complete(id, { status: "delivered", messageId })` · `{ status: "failed", error }` — `finished_at` 이 찍힌다.
  - `list(senderId)` — 최신순, 남의 `sender_id` 행은 없다.
- [X] T011 [P] [US1] `packages/domain/test/chat/turn-tools.test.ts`(순수): `runTurn` 의 SDK 옵션 중 턴 종류별 부분을 순수 함수 `buildTurnTools` 로 꺼내 검증한다 — `relayRun` 이면 `mcpServers` 키가 `memory` · `relay_run` 뿐이고 `allowedTools` 에 `promise` · `relay` 가 없다 / `promiseRun` 이면 기존과 같다 / 둘 다 없고 `canRelay` 가 아니면 `relay` 없음. (`canRelay` 경우는 US2 의 T024 에서 추가)
- [X] T012 [P] [US1] `apps/server/test/routes/relays.test.ts`(계약, domain mock):
  - 관리자 아닌 회원의 `GET /relays` · `GET /relays/members` · `POST /relays` → 403, domain 이 불리지 않는다.
  - 관리자 `POST /relays` — 본문 검증 실패 400, 목록에 없는 `recipientId` 404, `ClaudeTokenMissingError` → 409 `{ code: "claude_token_missing" }`(**`kind` 로 판별**), 성공 201.
  - `GET /relays` 응답 항목에 `messageId` 키가 없다.
- [X] T013 [P] [US1] `apps/server/test/routes/internal.test.ts` 에 추가(runner · domain mock): tick 이 전하기를 먼저 선점하고, 약속은 남은 몫(`CLAIM_LIMIT - 전하기 수`)만 집는다. 결과 배열에 `{ relayId, status }` 가 섞인다.

### 구현 — domain

- [X] T014 [P] [US1] `packages/domain/src/member/index.ts` 를 만든다(research R4 · R5).
  - `list(): Promise<Member[]>` — raw SQL `select id, email from auth.users where deleted_at is null and (banned_until is null or banned_until < now())`. Postgres 오류 코드 `42P01`(스키마 · 표 없음 — 로컬 docker)이면 `select distinct user_id from conversations` 로 폴백, `label = id.slice(0, 8)`. 다른 오류는 그대로 던진다. label 순 정렬. drizzle 스키마에 `auth.users` 를 넣지 않는 이유를 주석으로.
  - `matchMember(members, to)` 순수 함수(T009 규칙).
  - `packages/domain/src/index.ts` 에서 `member` 네임스페이스로 export.
- [X] T015 [US1] `packages/domain/src/relay/index.ts` 를 만든다(data-model.md "상태 전이" · "보존").
  - `create(senderId, recipient: Member, instruction)` — 먼저 `claudeToken.resolve(senderId)`, 없으면 `ClaudeTokenMissingError`. `recipient_label = recipient.label` 로 `pending` 행을 넣고, 같은 sender 의 끝난 행 중 최근 50개 밖을 지운다. `RelayItem` 반환.
  - `list(senderId, limit = 50)`, `claimPending(limit, now)` — 먼저 `lease_until < now` 인 `running` 을 `failed`("서버가 실행 중에 멈췄어요.")로 닫고, 트랜잭션에서 `pending` 을 `created_at` 순 `FOR UPDATE SKIP LOCKED` 로 집어 `running` + `lease_until = now + LEASE_MS`(`promise/index.ts` 의 상수 재사용). **만료된 running 을 다시 집지 않는 이유**(같은 말 두 번)를 주석으로.
  - `complete(id, outcome)` — `delivered`(+`messageId`) 또는 `failed`(+`error`), `finished_at`, `lease_until = null`.
  - 행 → `RelayItem` 매핑에서 `messageId` 를 빼는 이유(FR-019)를 주석으로.
- [X] T016 [US1] `packages/domain/src/relay/mcp.ts` 에 `createRelayRunMcpServer({ recipientId, relayId, state })` 를 만든다(contracts/relay-tools.md `relay_run`). 서버 이름 `RELAY_RUN_SERVER_NAME = "relay_run"`, 도구 `deliver({ text })` — 이미 보냈으면 거절, 아니면 `deliver(recipientId, { relayId }, text)` 후 `state.messageId` 기록. `ALLOWED_RELAY_RUN_TOOLS` export. 입력 스키마는 `@navis/validation` 의 `relayDeliverInputSchema.shape`.
- [X] T017 [US1] `packages/domain/src/chat/index.ts` 를 바꾼다(research R7).
  - `TurnInput.relayRun?: { relayId: string; state: RelayRunState }`.
  - `RELAY_RUN_PROMPT` 상수 — contracts/relay-tools.md 의 6개 요지를 그대로. 특히 "지시가 출처를 밝히라고 할 때만 '관리자님이 전해 달래요'처럼 밝히고, 그렇지 않으면 누가 맡겼는지 말하지 않는다"와 "반드시 deliver 를 한 번 부른다", "해로운 지시는 전하지 않는다".
  - SDK 옵션 조립을 `buildTurnOptions(input, ctx)` 순수 함수로 꺼낸다(T011 이 검증). `relayRun` 이면 `memory`(userId=받는 회원) + `relay_run` 만, 시스템 프롬프트 `SYSTEM_PROMPT + RELAY_RUN_PROMPT`.
- [X] T018 [US1] `packages/domain/src/relay/run.ts` 를 만든다. `executeRelay(claimed)`: 받는 회원 메인 방(`conversation.ensureMain`)의 최근 20개를 읽고, `runTurn({ userId: recipientId, tokenUserId: senderId, prompt: "[전하기]\n지시: …", history, relayRun })`. `state.messageId` 가 있으면 `delivered`, 없으면 `failed`("나비스가 전하지 않았어요."), 예외면 `failed`(err.message — 모델 출력이 아니라 오류 문구만, research R9). `relay.complete` 를 부른다. **던지지 않는다**. `packages/domain/src/index.ts` 에서 `relay` 네임스페이스로 export.

### 구현 — server

- [X] T019 [US1] `apps/server/src/promise-runner.ts` 를 넓힌다. `enqueue` 가 `{ userId, run: () => Promise<R> }` 형태의 일을 받게 하고(또는 `enqueueRelay` 추가), 약속 · 전하기 모두 같은 직렬 큐 + `turns.waitUntilIdle(받는 회원)` 을 거친다. 파일 머리 주석에 전하기도 같은 큐인 이유(턴 하나씩 · 대화 우선)를 더한다.
- [X] T020 [US1] `apps/server/src/routes/internal.ts` — tick 이 `relay.claimPending(CLAIM_LIMIT)` 를 먼저, 남은 몫으로 `promise.claimDue` 를 부른다. 둘 다 비면 지금처럼 바로 `{ claimed: 0 }`. 결과에 `{ relayId, status }` 를 섞는다.
- [X] T021 [US1] `apps/server/src/routes/relays.ts` 를 만들고 `app.ts` 에 연결한다(contracts/http.md).
  - `GET /members` → `member.list()`, `GET /` → `relay.list(userId)`, `POST /` → `relayCreateInputSchema` 검증 → `member.list()` 에서 `recipientId` 찾기(없으면 404) → `relay.create` → 201. `ClaudeTokenMissingError` 는 `err.kind === "claude_token_missing"` 로 판별해 409.
  - `app.ts`: `/memories/:id` DELETE 옆에 `app.use("/relays/*")` · `app.use("/relays")` 로 `isOwner` 아니면 403 `{ error: "말 걸기는 관리자만 할 수 있다." }`. 기본 잠금 안에 있다.
- [X] T022 [P] [US1] **(하지 않음 — 소비자 없음)** web BFF 는 `proxyToServer` 로 중계하고 `@navis/api` 에는 리소스별 메서드가 없다(헌장 원칙 I). 원래 계획: `packages/api/src/client.ts` 에 `relays.members()` · `relays.list()` · `relays.create(input)` 를 추가한다(스키마는 `@navis/validation`).

### 구현 — web

- [X] T023 [US1] web BFF · 훅 · 화면을 만든다(research R10, 원칙 III · V).
  - BFF: `apps/web/src/app/api/relays/route.ts`(GET · POST), `apps/web/src/app/api/relays/members/route.ts`(GET) — `proxyToServer` 중계만. 판단하지 않는다.
  - 훅: `apps/web/src/hooks/apis/relay/use-relay-members.ts`, `use-relay-list.ts`(목록에 `pending` · `running` 이 있을 때만 `refetchInterval: 5000`, 없으면 `false`), `use-create-relay.ts`(성공 시 목록 무효화, 409 면 "관리자 Claude 토큰을 먼저 등록해 주세요" 문구).
  - `apps/web/src/hooks/pages/relay/use-relay-composer.ts`(선택 회원 · 지시 상태 · 보내기 · 다시 보내기 — 기존 `hooks/pages/*` 관례를 따름), `relay-screen.tsx`, `relay-form.tsx`(Select + Textarea + 보내기 버튼), `relay-list.tsx`(받는 회원 · 지시 · 시각 · 상태 배지 · 실패 이유).
  - `apps/web/src/app/relay/page.tsx` — `useIsAdmin()` 이 거짓이면 "관리자만 쓸 수 있어요"만 그린다. 기존 `/memories` · `/settings` 페이지의 레이아웃을 따른다.
  - `apps/web/src/components/layout/top-bar.tsx` — ⋯ 메뉴에 관리자에게만 "말 걸기"(`/relay` 링크).
  - UI 문구는 한국어, 남의 상호명 금지.

**Checkpoint**: `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm --filter @navis/web build` 통과. quickstart M1–M6 · M10–M12 수동 확인. **여기서 멈추고 확인받는다.**

---

## Phase 4: User Story 2 — 관리자 대화에서 "OO한테 전해줘" (P2)

**Goal**: 관리자 대화 턴에만 `relay` 도구가 열려, 이름 · 이메일로 받는 사람을 정하고 넣는다. 못 정하면 되묻는다.

**Independent Test**: quickstart M7–M9.

- [ ] T024 [P] [US2] `packages/domain/test/chat/turn-tools.test.ts` 에 추가: `canRelay: true` 인 대화 턴에만 `relay` 서버 · 도구가 있고, `canRelay` 가 참이어도 `promiseRun` · `relayRun` 턴에는 없다.
- [ ] T025 [P] [US2] `apps/server/test/routes/chat.test.ts` 에 추가(domain mock): 관리자의 대화 요청은 `runTurn` 에 `canRelay: true`, 다른 회원은 `false` 로 넘긴다.
- [ ] T026 [US2] `packages/domain/src/relay/mcp.ts` 에 `createRelayMcpServer({ senderId })` 를 만든다(contracts/relay-tools.md `relay`). 이름 `RELAY_SERVER_NAME = "relay"`, 도구 `relay({ to, instruction })` — `member.list()` → `matchMember` → 하나면 `relay.create(senderId, member, instruction)` 후 "{label} 님께 전하기를 맡겼어요. 1–2분 안에 도착해요.", none · ambiguous 면 `isError` 로 후보 이메일 목록. 입력 스키마에 회원 uuid 가 없다는 것과 그 이유(원칙 II)를 주석으로. 도구 설명에 FR-021("관리자의 기억에서 꺼낸 내용을 덧붙이지 않는다")을 넣는다. `ALLOWED_RELAY_TOOLS` export.
- [ ] T027 [US2] `packages/domain/src/chat/index.ts` — `TurnInput.canRelay?: boolean`. `buildTurnOptions` 가 대화 턴(약속 · 전하기 턴 아님)이고 `canRelay` 일 때만 `relay` 서버 · 도구를 열고, 시스템 프롬프트에 짧은 절(받는 사람을 정할 수 없으면 되묻는다, 무엇을 전할지 없으면 묻는다)을 붙인다. 회원 턴에는 아무것도 바뀌지 않는다(성능 절).
- [ ] T028 [US2] `apps/server/src/routes/chat.ts` 가 `runTurn` 에 `canRelay: isOwner(userId)` 를 넘긴다. `isOwner` 를 `app.ts` 에서 공유 가능한 곳(예: `apps/server/src/owner.ts`)으로 옮기고 `app.ts` · `chat.ts` 가 함께 쓴다. `/mcp`(외부 MCP)는 건드리지 않는다.

**Checkpoint**: 테스트 통과, quickstart M7–M9. **멈추고 확인받는다.**

---

## Phase 5: User Story 3 — 관리자가 보낸 기록을 본다 (P3)

**Goal**: 기록 목록에서 상태 · 실패 이유를 보고, 실패한 것을 같은 지시로 다시 보낸다.

**Independent Test**: 두 건을 보내 하나는 실패시키고(M12), 목록 순서 · 상태 · 이유 · 다시 보내기를 확인한다.

- [ ] T029 [US3] `apps/web/src/features/relay/relay-list.tsx` 와 `use-relay-form.ts` — 실패 항목에 "다시 보내기" 버튼: 같은 받는 회원 · 지시로 `use-create-relay` 를 부른다(새 행). 판단은 훅, 컴포넌트는 렌더만. 지은 문장 · `messageId` 를 보여줄 자리가 없음을 확인한다(FR-019).
- [ ] T030 [P] [US3] 기록 목록의 빈 상태("아직 보낸 말이 없어요")와 상태 배지 문구(대기 · 전하는 중 · 전함 · 실패)를 정리한다 — `apps/web/src/features/relay/relay-list.tsx`.

**Checkpoint**: 웹 빌드 통과, US3 Independent Test.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T031 [P] `apps/server/.env.example` · `deploy/README.md` 에 "전하기는 새 환경변수가 없다. 운영 DB 에서 server 역할이 `auth.users` 를 읽을 수 있어야 한다(quickstart S0)"를 적는다.
- [ ] T032 [P] `README.md` 의 기능 · 라우트 목록에 전하기(`/relays*`, `relay` · `relay_run` 도구)를 더한다.
- [ ] T033 운영 배포 전 quickstart S0(운영 `auth.users` 권한) 확인 → `pnpm db:migrate`(운영) → 배포 → quickstart M1–M12 를 운영에서 한 번 돈다. S0 가 실패하면 배포하지 않고 research R4-b 로 바꾼다.

---

## Dependencies & Execution Order

- **T001(헌장)** → 모든 것.
- **Phase 2**: T002 → T003. T004 는 T002 와 병렬. T005 · T006 · T007 은 서로 다른 파일이라 병렬 가능하지만 T006 · T007 은 `deliver` ↔ `appendMessage` 인자로 맞물리므로 T007 → T006 순서를 권한다. T008 은 T007 뒤.
- **US1**: 테스트 T009–T013 [P] 먼저 작성(실패 확인) → T014 [P] · T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 [P] → T023.
- **US2**: US1 의 T015(`relay.create`) · T014(`member`) · T017(`buildTurnOptions`)에 의존. US1 화면(T023)과는 독립.
- **US3**: T023 에 의존.
- **Polish**: 전부 뒤. T033 은 마지막.

### 병렬 예시

```text
# Phase 2
T002 relays 표   ‖  T004 validation/relay.ts

# US1 테스트
T009 match.test  ‖  T010 relay/index.test  ‖  T011 turn-options.test  ‖  T012 relays.test  ‖  T013 internal.test

# US1 구현
T014 member/index.ts  ‖  T022 api client
```

## Implementation Strategy

1. **MVP = Phase 1 + 2 + US1.** 화면에서 보내고 받는 회원에게 도착하면 사용자가 원한 권한이 생긴다. Checkpoint 에서 멈추고 확인받는다(사용자 원칙: 큰 구현은 단계마다 멈춤).
2. US2(대화 입구) → 확인.
3. US3(기록 다듬기) → Polish → 운영 S0 → 배포.
4. 커밋은 헌장 규약대로 한국어 본문 + Conventional Commits(`docs(constitution):`, `feat(db):`, `feat(domain):`, `feat(server):`, `feat(web):`, `test:`).
