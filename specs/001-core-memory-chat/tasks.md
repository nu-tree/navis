---

description: "핵심 나비스 — 기억과 대화 구현 작업 목록"
---

# Tasks: 핵심 나비스 — 기억과 대화

**Input**: `/specs/001-core-memory-chat/` 의 설계 문서

**Prerequisites**: plan.md · spec.md · research.md · data-model.md · contracts/ · quickstart.md

**Tests**: **포함한다.** 헌장 v1.1.0 이 `pnpm test` 를 머지 조건으로 규정한다. 범위는 헌장이
정한 두 층뿐이다 — `packages/domain` 의 순수 함수, `apps/server` 의 계약(`app.fetch()` 직접
호출). 웹 컴포넌트 단위 테스트와 E2E 는 만들지 않는다. 확률적 기준은 `quickstart.md` 의 수동
시나리오가 덮는다.

**Organization**: 사용자 이야기별로 묶는다. 각 이야기는 독립적으로 구현 · 검증 · 배포된다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능 (다른 파일, 미완료 작업에 의존하지 않음)
- **[Story]**: 대응하는 사용자 이야기 (US1~US6)
- 설명에 정확한 파일 경로를 넣는다

## Path Conventions

이 저장소는 pnpm 모노레포다(`plan.md` 의 Structure Decision).

- 웹: `apps/web/src/`
- 서버: `apps/server/src/`
- 공용: `packages/{validation,domain,db,api,config}/src/`
- 테스트는 대상 패키지 안에 둔다 (`packages/domain/src/**/*.test.ts`, `apps/server/src/**/*.test.ts`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 새로 들이는 것을 세우고, 계약을 바꿀 수 있는 실측을 먼저 끝낸다

- [X] T001 Vitest 를 루트 devDependency 로 추가하고 `package.json` 에 `"test": "turbo run test"` 스크립트를 넣는다
- [X] T002 `turbo.json` 의 `tasks` 에 `test` 를 추가한다 (`dependsOn: ["^build"]`, 캐시 허용)
- [X] T003 [P] `packages/domain/package.json` 과 `apps/server/package.json` 에 `"test": "vitest run"` 스크립트와 vitest devDependency 를 추가한다
- [X] T004 [P] `apps/server/src/env.ts` 에 `VOYAGE_API_KEY` 를 `required()` 로 추가한다 — 환경변수는 부팅 때 한 번 확인한다(헌장 보안 절)
- [X] T005 [P] `apps/server/.env.example` 과 `apps/web/.env.example` 에 로그인 · 임베딩용 항목을 추가한다. `apps/web` 쪽 값에 `NEXT_PUBLIC_` 을 붙이지 않는다
- [X] T006 `apps/web/package.json` 에 `@supabase/ssr` 을 추가하고 `pnpm-workspace.yaml` 의 `minimumReleaseAgeExclude` 가 필요한지 확인한다

### 실측 스파이크 (계약을 바꿀 수 있으므로 먼저)

- [X] T007 **[R3 실측]** `allowedTools` 없이 프로세스 내 MCP 도구가 자동 실행되는지 확인한다. 최소 도구 하나를 `apps/server` 에 임시로 붙여 한 턴 돌린다. 승인 프롬프트가 걸리면 `allowedTools: ['mcp__memory__*']` 를 계약에 확정하고 `specs/001-core-memory-chat/contracts/memory-mcp.md` 를 갱신한다
- [X] T008 **[R4 실측]** Haiku 모델 id 를 확정한다. `claude-haiku-4-5` 와 `claude-haiku-4-5-20251001` 을 각각 한 턴 돌려 어느 쪽이 유효한지 확인하고 `packages/validation/src/chat.ts` 의 `SELECTABLE_MODELS` 를 고친다. 확정 전까지 화면 선택기에는 `DEFAULT_MODEL` 만 노출한다(FR-007)
- [X] T009 **[R5 실측]** Voyage AI 에서 **1024차원**을 내는 모델명을 확인한다. `packages/db/src/schema.ts` 가 `vector("embedding", { dimensions: 1024 })` 로 고정되어 있어 차원이 다르면 삽입이 실패한다

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 사용자 이야기가 깔고 쓰는 것

**⚠️ CRITICAL**: 이 단계가 끝나기 전에는 어떤 사용자 이야기도 시작할 수 없다

### 계약 정리 — 소비자를 잃은 것을 먼저 지운다 (헌장 원칙 I)

- [X] T010 `packages/validation/src/memory.ts` 에서 `graphifyInputSchema` 와 `GraphifyInput` 을 삭제한다 — 기억 그래프는 범위 밖(Q2)
- [X] T011 `packages/validation/src/memory.ts` 의 `saveResultSchema` 를 판별 유니온에서 **단일 갈래로 접는다**. `skipped` / `duplicates` 갈래는 중복 판정을 하지 않기로 해 소비자가 없다(Q2, FR-011)
- [X] T012 `packages/validation/src/memory.ts` 의 `saveInputSchema` 에서 `skipIfDuplicate` 와 `source` 를, `memorySchema` 에서 출처 관련 필드를 삭제한다 — 출처 미기록 확정(Q1, FR-015)
- [X] T013 `packages/validation/src/memory.ts` 에 `memoryExportSchema` 를 추가한다: `{ exportedAt: string, count: number, memories: Memory[] }` (R8, FR-050)
- [X] T014 `apps/server/src/app.ts` 의 라우트 목록 주석에서 `/mcp` 예고를 삭제한다 — 부를 소비자가 없다(Q3)

### 오류 · 임베딩 · 스키마

- [X] T015 `packages/domain/src/errors.ts` 를 만들고 **타입 있는 오류**를 정의한다 (`NotFoundError`, `EmbeddingError`). 없는 id 에 대한 오류를 한국어 메시지 문자열로 판정하지 않는다 — 문구를 다듬으면 404 가 500 이 된다(FR-041, `STRUCTURE.md` 7항)
- [X] T016 `packages/domain/src/memory/embed.ts` 에 `embed()` 를 구현한다. **`json.data[0].embedding` 을 무가드로 읽지 않는다** — 200 + 빈 `data` 면 `EmbeddingError` 를 던진다(FR-042, `STRUCTURE.md` 8항, R5)
- [X] T017 [P] `packages/domain/src/memory/embed.test.ts` — 빈 `data`, 오류 응답, 차원 불일치 각각에서 `EmbeddingError` 가 나오는지 검증한다
- [X] T018 `packages/db/src/schema.ts` 의 `memories` 에서 `source` 컬럼을 삭제하고 `pnpm db:generate` → `pnpm db:migrate` 를 돌린다 — 부팅 시 자동 마이그레이션은 없다(헌장). **데이터 유실이므로 선택 사항이다**; 남겨두고 쓰지 않아도 동작에 지장이 없다
- [X] T019 `packages/domain/src/memory/mapping.ts` 에 저장↔와이어 매핑을 만든다. `tags: string[]` 와 `done: boolean` 은 DB 의 `metadata` jsonb 안에 살고 밖으로는 일급 필드로 나간다. `relatedIds` 도 `metadata` 에 둔다 — 조인 테이블을 만들지 않는다(data-model.md)
- [X] T020 [P] `packages/domain/src/memory/mapping.test.ts` — jsonb ↔ 일급 필드 왕복이 손실 없는지, `category` 가 `decision·learning·idea·feeling·people·todo` 중 하나이거나 `null` 인지, `project` 가 `null` 일 때 개인 · 전역 기억으로 취급되는지 검증한다

### 기억 MCP 골격 · BFF 중계

- [X] T021 `packages/domain/src/memory/mcp.ts` 에 `createSdkMcpServer({ name: 'memory', tools: [] })` 골격을 만든다. 도구는 이후 이야기에서 채운다. 서버명을 `memory` 로 두면 도구가 `mcp__memory__<도구명>` 으로 노출된다(R3)
- [X] T022 `packages/domain/src/chat/index.ts` 의 `query()` 옵션에 `mcpServers: { memory: <config> }` 를 넘긴다. **`tools: []` 는 그대로 둔다** — 그 배열은 내장 도구 집합이므로 MCP 도구와 충돌하지 않는다(R3, 헌장 보안 절)
- [X] T023 `apps/web/src/lib/bff.ts` 에 업스트림 중계 헬퍼를 만든다. `apiServer.token` 을 붙이고 오류를 그대로 전달한다. 세션 검증 자리는 비워둔다 — US6 에서 채운다
- [X] T024 [P] `apps/server/src/app.test.ts` — `/health` 는 토큰 없이 200, 그 밖의 모든 경로는 토큰 없이 **401** 임을 `app.fetch()` 로 검증한다. 기본 잠금이 깨지면 여기서 잡힌다(헌장 보안 절)

**Checkpoint**: `pnpm typecheck` · `pnpm lint` · `pnpm test` 통과. 서버가 뜨고 `/health` 가 200, 나머지가 401.

---

## Phase 3: User Story 1 — 대화하면 기억이 쌓인다 (P1) 🎯 MVP

**Goal**: 사용자가 평소처럼 대화하면 나비스가 기억할 가치가 있는 것을 그 턴 안에 저장하고,
저장했다는 사실을 화면에 알린다.

**Independent test**: 기억이 비어 있는 상태에서 `나 이번 분기엔 나비스에 집중하기로 했어` 를
한 턴 보낸 뒤, 기억 목록 조회에 그 내용이 `decision` 분류로 있고 화면에 저장 표시가 보이면
통과. (`quickstart.md` S1)

- [X] T025 [US1] `packages/domain/src/memory/save.ts` 에 `save()` 를 구현한다. `content` 는 **최소 1자**, `category` 는 6개 값 중 하나이거나 없음, `project` 는 없으면 `null`(개인 · 전역 기억). **중복 판정을 하지 않는다** — 비슷한 기억이 있어도 항상 새로 저장한다(FR-011, Q2)
- [X] T026 [P] [US1] `packages/domain/src/memory/save.test.ts` — 중복 판정을 하지 않는다는 것을 명시적으로 검증한다(같은 내용을 3번 저장하면 3건). `content` 빈 문자열 거부, 분류 밖 값 거부
- [X] T027 [US1] `packages/domain/src/memory/mcp.ts` 에 `save` 도구를 등록한다. 입력 스키마는 `@navis/validation` 의 `saveInputSchema` 를 그대로 쓰고, 모델을 향한 설명문만 등록부에 둔다(contracts/memory-mcp.md)
- [X] T028 [US1] `packages/domain/src/chat/index.ts` 의 시스템 프롬프트에 저장 판단 기준을 넣는다: 기억할 가치가 있는 사실(결정 · 배움 · 아이디어 · 감정 · 사람 · 할 일)을 들으면 `save` 를 부르고, 잡담은 저장하지 않는다(FR-009, US1 시나리오 2)
- [X] T029 [US1] `packages/domain/src/chat/index.ts` 의 `runTurn` 이 이 턴에 기억 도구를 실제로 불렀는지 세어 `TurnResult` 로 돌려준다 — `done.saved` 의 유일한 근거다(FR-010, contracts/chat-stream.md)
- [X] T030 [US1] `apps/server/src/routes/chat.ts` 의 `done` 이벤트에서 `saved: false` 하드코딩을 T029 의 값으로 바꾼다
- [X] T031 [US1] `packages/domain/src/memory/recent.ts` 에 `recent()` 를 구현한다 — 이 이야기의 검증에 필요한 **최소 조회**만. 필터 전체는 US4 에서 채운다
- [X] T032 [US1] `apps/server/src/routes/memories.ts` 를 만들고 `GET /memories`(목록) · `POST /memories`(수동 추가)를 붙인다. `app.ts` 에 라우트를 등록한다(contracts/server-http.md)
- [X] T033 [P] [US1] `apps/server/src/routes/memories.test.ts` — `POST /memories` 가 `Memory` 를 바로 돌려주는지(판별 유니온이 아님), 잘못된 본문에 400 + `detail: issues` 인지 검증한다
- [X] T034 [US1] `apps/web/src/features/chat/message-bubble.tsx` 에 저장 표시를 넣는다. `done.saved` 가 참인 턴에만 보인다. props 를 늘리지 않고 메시지에 담긴 값으로 판단한다(헌장 원칙 V)
- [X] T035 [US1] `apps/web/src/features/chat/use-chat.ts` 가 `done` 이벤트의 `saved` 를 메시지에 실어 목록으로 옮긴다

### 추가 — `/speckit-analyze` 가 찾은 커버리지 갭 (2026-09-11 등록)

스펙 요구인데 작업이 없던 셋. US1 이 "완료"로 표시됐지만 실제로는 빠져 있었다.

- [X] T106 [US1] **[analyze C1 · FR-006]** `packages/domain/src/chat/index.ts` 의 `runTurn` 이 `images?: string[]`(data URL, 최대 8장)을 받아 SDK 에 이미지 블록으로 넘긴다. `query()` 의 `prompt` 를 `AsyncIterable<SDKUserMessage>` 형태로 바꿔야 한다 — 문자열 프롬프트로는 이미지를 실을 수 없다. data URL 파싱과 media type 검증을 가드한다
- [X] T107 [US1] **[analyze C1 · FR-006]** `apps/server/src/routes/chat.ts` 가 `req.images` 를 `runTurn` 에 넘긴다
- [X] T108 [US1] **[analyze C1 · FR-006]** `apps/web/src/features/chat/chat-input.tsx` 에 이미지 선택·미리보기·제거를 붙인다. **최대 8장**, **텍스트 없이 이미지만으로도 전송 가능**해야 한다(`canSend` 조건 수정)
- [X] T109 [US1] **[analyze C2 · FR-007]** `apps/web/src/features/chat/chat-input.tsx` 에 모델 선택기를 붙인다. 목록은 `@navis/validation` 의 `SELECTABLE_MODELS`, 초기값은 `DEFAULT_MODEL`. T008 실측으로 id 가 확정됐으므로 전체 목록을 노출한다
- [X] T110 [US1] **[analyze C3 · SC-012]** `apps/web/src/features/chat/chat-panel.tsx` 의 빈 상태가 **무엇을 하면 되는지** 알려준다. 지금은 "무엇을 도와드릴까요?" 뿐이라 처음 여는 사용자가 첫 기억을 남기는 방법을 모른다(엣지 케이스 "첫 실행")

**Checkpoint**: `quickstart.md` S1 통과. 잡담에 기억이 늘지 않고, 같은 말을 반복하면 기억이 한 건 더 생긴다.

---

## Phase 4: User Story 2 — 과거를 물으면 기억으로 답한다 (P1)

**Goal**: 사용자가 과거를 물으면 나비스가 의미가 가까운 기억을 찾아 답에 반영한다. 저장 당시와
같은 단어를 쓰지 않아도 찾는다.

**Independent test**: 기억을 HTTP 로 직접 몇 건 주입한 뒤(US1 없이 가능) 저장 때와 다른 표현으로
질문해 그 내용이 답에 나오면 통과. 인사 10턴에 기억 검색이 0회면 함께 통과. (`quickstart.md` S2, S3)

- [X] T036 [US2] `packages/domain/src/memory/rerank.ts` 에 시간 가중치 재정렬을 **순수 함수**로 구현한다: `score = similarity × decay(age)`. 반감기 방식. 입출력이 배열인 순수 함수라 `let` 없이 `map`/`sort` 로 쓴다(헌장 원칙 IV, R6)
- [X] T037 [P] [US2] `packages/domain/src/memory/rerank.test.ts` — 유사도가 대등하면 최근 기억이 앞에 오는지(FR-017), 유사도 차이가 크면 시간이 뒤집지 못하는지, 빈 배열 · 단일 원소를 검증한다
- [X] T038 [US2] `packages/domain/src/memory/recall.ts` 에 `recall()` 을 구현한다. **HNSW 코사인 거리로 후보 N 건(limit 의 약 4배, 상한 200)만 DB 에서 뽑고** 재정렬은 T036 에 맡긴다 — 가중치를 SQL `ORDER BY` 에서 곱하면 `memories_embedding_idx` 를 타지 못한다(R6)
- [X] T039 [US2] `packages/domain/src/memory/recall.ts` 의 `recall()` 에 프로젝트 스코프 필터를 넣는다: 스코프가 주어지면 **그 프로젝트 + `project IS NULL` 인 개인 기억**만 후보로 삼는다(FR-018)
- [X] T040 [US2] `packages/domain/src/memory/recall.ts` 의 `recall()` 반환 상한을 **최대 50건**으로 강제한다(FR-019, `recallInputSchema` 의 `limit` 상한과 일치해야 한다)
- [X] T041 [US2] `packages/domain/src/memory/mcp.ts` 에 `recall` 도구를 등록한다
- [X] T042 [US2] `packages/domain/src/chat/index.ts` 의 시스템 프롬프트에 호출 시점 기준을 넣는다: 사용자가 과거를 물으면 **반드시** `recall` 을 부르고(FR-053), 인사 · 감사에는 부르지 않고(FR-052), 결과가 비면 **없다고 말한다**(FR-020). 턴이 끝난 뒤 저장 여부를 다시 판단하는 과정을 넣지 않는다(헌장 성능 절)
- [X] T043 [US2] `apps/server/src/routes/memories.ts` 에 `GET /memories/search`(`RecallInput` 쿼리 → `RecallHit[]`)를 붙인다
- [X] T044 [P] [US2] `apps/server/src/routes/memories.test.ts` 에 검색 계약 테스트를 추가한다 — `limit` 상한 초과 요청에 400, 스코프 필터가 개인 기억을 포함하는지

**Checkpoint**: `quickstart.md` S2 · S3 통과. 인사 턴에 진행 표시로 기억 도구가 나타나지 않고 첫 글자가 3초 안에 온다.

---

## Phase 5: User Story 3 — 대화가 이어진다 (P2)

**Goal**: 방을 다시 열면 이전 메시지가 남아 있고, 서버를 재시작한 뒤에도 나비스가 그 방의
맥락을 이어서 답한다. 사용자가 보낸 글은 어떤 실패에서도 유실되지 않는다.

**Independent test**: 두 턴 대화 → 서버 재시작 → 같은 방에서 `방금 무슨 얘기했지?` 에 이어서
답하면 통과. 턴 실패 · 중지 · 재시작 각 10회에서 질문이 모두 남으면 함께 통과.
(`quickstart.md` S4, S5, S6)

- [ ] T045 [US3] `packages/domain/src/conversation/index.ts` 에 `list()` 를 구현한다. **`messages` 를 반환하지 않는다** — `ConversationSummary`(제목 · 마지막 메시지 · 메시지 수 · `sessionId` · 시각)만 싣고 `updated_at DESC` 인덱스를 쓴다(FR-032, `STRUCTURE.md` 6항)
- [ ] T046 [US3] `packages/domain/src/conversation/index.ts` 에 `get()` · `create()` · `appendMessage()` · `remove()` · `removeMessage()` 를 구현한다. 없는 id 는 `NotFoundError`(T015)를 던진다
- [ ] T047 [US3] `appendMessage()` 의 메시지 id 를 `crypto.randomUUID()` 로 만든다. `` `a${Date.now()}` `` 는 같은 ms 안에서 충돌한다(FR-035, `STRUCTURE.md` 5항)
- [ ] T048 [P] [US3] `packages/domain/src/conversation/index.test.ts` — `list()` 반환에 `messages` 키가 없는지, `appendMessage` 가 read-modify-write 로 기존 메시지를 지우지 않는지, 같은 ms 에 두 메시지를 만들어 id 충돌이 없는지 검증한다
- [ ] T049 [US3] `apps/server/src/routes/chat.ts` 의 순서를 고정한다: **검증 → (방 없으면 생성) → 사용자 메시지 append → 그 다음 SSE 스트림 시작**. 스트림을 열기 전에 질문이 커밋되어야 서버가 언제 죽어도 남는다(FR-048, R9)
- [ ] T050 [US3] `routes/chat.ts` 의 `done` 핸들러가 어시스턴트 메시지를 append 하고 `sessionId` 를 `conversations.sessionId` 에 저장한다. `sessionId` 는 `result` 메시지가 권위다
- [ ] T051 [US3] `routes/chat.ts` 의 프로세스 로컬 `sessions` Map 을 삭제하고 `conversations.sessionId` 조회로 바꾼다 — 재시작 후 맥락 이어가기의 조건이다(R10, 코드의 기존 `TODO`)
- [ ] T052 [US3] `routes/chat.ts` 에 같은 방의 동시 턴을 **409** 로 막는다. FR-008 은 클라이언트 측 방어라 새로고침으로 우회된다(R9, contracts/server-http.md)
- [ ] T053 [US3] `apps/server/src/routes/chat.ts` 의 `inFlight` (AbortController) Map 은 **프로세스 로컬로 유지한다** — 중지는 생성이 도는 프로세스에서만 유효하고 서버 인스턴스가 하나다(R10). 이 판단을 주석으로 남긴다
- [ ] T054 [US3] `apps/server/src/routes/conversations.ts` 를 만들고 `GET /conversations` · `GET /conversations/:id` · `DELETE /conversations/:id` · `DELETE /conversations/:id/messages/:messageId` 를 붙인다. **방 생성 전용 엔드포인트는 만들지 않는다** — 첫 메시지가 겸한다(헌장 원칙 I)
- [ ] T055 [US3] `apps/server/src/routes/conversations.ts` 의 `DELETE /conversations/:id` 가 그 방에서 저장된 **기억을 지우지 않음**을 보장한다. 기억은 방과 완전히 독립이다(FR-015, Q1)
- [ ] T056 [P] [US3] `apps/server/src/routes/conversations.test.ts` — 목록 응답에 `messages` 가 없는지, 없는 id 에 **404**(500 아님)인지, 진행 중인 턴이 있는 방에 새 턴이 409 인지 검증한다
- [ ] T057 [US3] `apps/web/src/app/api/conversations/` 아래에 BFF 라우트를 만든다. T023 의 중계 헬퍼를 쓴다
- [ ] T058 [US3] `apps/web/src/features/conversation/use-conversations.ts` 를 만든다. 목록 · 선택 · 생성 · 삭제 상태를 훅이 갖고 `.tsx` 는 렌더만 한다(헌장 원칙 III)
- [ ] T059 [US3] `apps/web/src/components/layout/sidebar.tsx` 를 배선한다. **`PLACEHOLDER_ROOMS` 와 `unread` 배지 · `SidebarMenuBadge` 를 제거한다** — 계약에 `unread` 가 없다(data-model.md 경고)
- [ ] T060 [US3] `apps/web/src/features/chat/use-chat.ts` 가 `conversationId` 를 훅 안에서 만들지 않고 선택된 방에서 받는다. 방이 바뀌면 메시지를 그 방의 것으로 교체한다(FR-031)
- [ ] T061 [US3] 중단된 답변의 부분 텍스트를 기록하지 않는다는 것을 `use-chat.ts` 에 반영한다. 화면에는 남지만 방을 다시 열면 사라진다(FR-004, Q3=B)
- [ ] T111 [US3] **[analyze G1 · CRITICAL]** `apps/web/src/features/chat/message-bubble.tsx` 와 `message-list.tsx` 에 개별 메시지 삭제를 붙인다. T054 가 `DELETE /conversations/:id/messages/:messageId` 를 만드는데 **부르는 UI 가 없으면 소비자 없는 라우트**가 되어 헌장 원칙 I 위반이고, "답 없는 질문의 연속" 엣지 케이스도 미충족으로 남는다. 중단된 질문이 방에 남은 상태에서 다시 보내면 같은 질문이 두 번 보이므로 하나를 지울 수 있어야 한다

**Checkpoint**: `quickstart.md` S4 · S5 · S6 통과. 서버를 재시작해도 맥락이 이어지고 질문이 유실되지 않는다.

---

## Phase 6: User Story 4 — 내 기억을 직접 관리한다 (P2)

**Goal**: 기억 화면에서 목록 · 검색 · 수정 · 삭제 · 할 일 완료를 하고, 겹치는 기억을 찾아
정리하고, 전체를 파일로 내보낸다.

**Independent test**: 기억 몇 건을 넣고 화면에서 다섯 동작을 각각 수행한 뒤, 수정한 내용이
이후 검색에 반영되면 통과. 겹치는 3건을 1분 안에 1건으로 줄이면 함께 통과.
(`quickstart.md` S7, S8, S9)

- [ ] T062 [US4] `packages/domain/src/memory/recent.ts` 의 `recent()` 를 완성한다 — 분류 · 프로젝트 · 기간(`days` 최대 365) 필터, `limit` 최대 200, `created_at DESC`(FR-021)
- [ ] T063 [US4] `packages/domain/src/memory/update.ts` 에 `update()` 를 구현한다. **`content` 를 바꾸면 임베딩을 재계산한다** — 안 하면 고친 내용으로 검색되지 않는다(FR-024). `project` 에 빈 문자열이 오면 개인 기억으로 되돌린다
- [ ] T064 [P] [US4] `packages/domain/src/memory/update.test.ts` — `content` 변경 시 재임베딩이 호출되고 다른 필드만 바꿀 때는 호출되지 않는지, 없는 id 에 `NotFoundError` 인지 검증한다
- [ ] T065 [US4] `packages/domain/src/memory/remove.ts` 에 `remove()` 를 구현한다. 없는 id 는 `NotFoundError`
- [ ] T066 [US4] `packages/domain/src/memory/todos.ts` 에 `todos()` 를 구현한다. 기본은 **미완료만**, `includeDone` 이면 완료된 것도 함께(FR-026). `done` 은 `metadata` 안에 있다
- [ ] T067 [US4] `packages/domain/src/memory/neighbors.ts` 에 이웃 조회를 구현한다. **그 기억의 벡터로 같은 HNSW 인덱스를 다시 타서** 유사 이웃 상위 k 를 반환한다. 전체 쌍 비교(O(n²))나 클러스터링을 하지 않는다(FR-047, R7)
- [ ] T068 [P] [US4] `packages/domain/src/memory/neighbors.test.ts` — 자기 자신이 결과에서 빠지는지, 이웃이 없을 때 빈 배열인지, 없는 id 에 `NotFoundError` 인지 검증한다
- [ ] T069 [US4] `packages/domain/src/memory/export.ts` 에 내보내기 직렬화를 구현한다. `{ exportedAt, count, memories }`, 들여쓰기 2칸 JSON. 기억이 **0건이어도 실패하지 않고** `count: 0` · `memories: []` 를 만든다(FR-050, FR-051, R8)
- [ ] T070 [P] [US4] `packages/domain/src/memory/export.test.ts` — 각 기억에 `content` · `category` · `project` · `tags` · `done` · `createdAt` 이 모두 있는지(**누락 필드 0건**, SC-016), 0건 케이스를 검증한다
- [ ] T071 [US4] `packages/domain/src/memory/mcp.ts` 에 `recent` · `todos` · `update` · `remove` 도구를 등록한다. **`graphify` 는 등록하지 않는다**(Q2)
- [ ] T072 [US4] `apps/server/src/routes/memories.ts` 에 남은 엔드포인트를 붙인다: `GET /memories/:id/neighbors` · `PATCH /memories/:id` · `DELETE /memories/:id` · `GET /memories/todos` · `GET /memories/export`
- [ ] T073 [P] [US4] `apps/server/src/routes/memories.test.ts` 에 계약 테스트를 추가한다 — 없는 id 에 404, `PATCH` 후 검색 결과가 바뀌는지, `export` 가 0건에서도 200 인지
- [ ] T074 [US4] `apps/web/src/app/api/memories/` 아래에 BFF 라우트를 만든다
- [ ] T075 [US4] `apps/web/src/features/memory/use-memories.ts` — 목록 · 필터 · 검색 상태를 훅이 갖는다
- [ ] T076 [P] [US4] `apps/web/src/features/memory/use-memory-neighbors.ts` — 항목 하나의 이웃 조회. 목록 훅과 분리해 목록이 이웃 상태를 props 로 흘리지 않게 한다(헌장 원칙 V)
- [ ] T077 [US4] `apps/web/src/features/memory/memory-list.tsx` — 최신순 목록, 분류 · 프로젝트 · 기간 필터. 도메인 타입을 아는 컴포넌트이므로 `features/` 에 둔다(헌장 원칙 III)
- [ ] T078 [US4] `apps/web/src/features/memory/memory-item.tsx` — 항목 하나. 펼치면 이웃이 보인다. 이웃 영역은 **`children` 합성**으로 받는다(헌장 원칙 V)
- [ ] T079 [P] [US4] `apps/web/src/features/memory/memory-editor.tsx` — 내용 · 분류 · 프로젝트 · 태그 수정
- [ ] T080 [P] [US4] `apps/web/src/features/memory/todo-list.tsx` — 할 일만, 완료 토글, 완료 포함 보기
- [ ] T081 [US4] `apps/web/src/app/memories/page.tsx` — 기억 화면. 목록 · 검색 · 할 일 · 내보내기를 한 화면에 둔다. **새 화면을 만들지 않는다** — 세 화면 상한(SC-010)
- [ ] T082 [US4] `apps/web/src/features/memory/memory-export-button.tsx` 를 만들고 `apps/web/src/app/memories/page.tsx` 에 붙인다. 브라우저가 BFF 응답을 파일로 받는다

**Checkpoint**: `quickstart.md` S7 · S8 · S9 통과.

---

## Phase 7: User Story 6 — 혼자 쓰는 나비스를 잠근다 (P2)

**Goal**: 로그인하지 않으면 대화 · 기억 · 설정 어느 화면도 내용을 보여주지 않는다. 로그인
상태는 브라우저를 닫아도 유지되고, 로그아웃하면 즉시 잠긴다.

**Independent test**: 로그아웃 상태에서 세 화면 주소를 직접 입력해 전부 막히고, BFF 를 직접
찔러 401 JSON 이 오면 통과. 기억 · 대화 기능 없이도 검증된다. (`quickstart.md` S11, S12)

- [ ] T083 [US6] `apps/web/src/lib/session.ts` 에 세션 검증을 만든다. `@supabase/ssr` 의 쿠키 어댑터를 쓴다. 이 파일이 인증을 아는 **유일한 곳**이고 `packages/*` 로 새지 않는다(헌장 원칙 II)
- [ ] T084 [US6] `apps/web/src/proxy.ts` 를 만든다. **`middleware.ts` 가 아니다** — Next 16 에서 미들웨어는 `proxy` 다(헌장 규약). `matcher` 로 `api` · `_next/static` · `_next/image` 를 제외하고, **쿠키만 읽어** 낙관적으로 리다이렉트한다. 데이터베이스를 보지 않는다(헌장 보안 절, R2)
- [ ] T085 [US6] `apps/web/src/lib/bff.ts` (T023) 의 중계 헬퍼에 `apps/web/src/lib/session.ts` 의 세션 검증을 끼운다. 세션이 없으면 **401 JSON** 을 돌려준다 — 리다이렉트하지 않는다. `fetch` 호출자가 HTML 을 받으면 파싱이 깨진다(헌장 보안 절)
- [ ] T086 [US6] `apps/web/src/features/auth/use-auth.ts` — 로그인 · 로그아웃 훅. 브라우저 클라이언트는 **로그인 · 로그아웃에만** 쓴다. 데이터 요청은 계속 `/api/*` 로만 간다(헌장 보안 절)
- [ ] T087 [US6] `apps/web/src/app/login/page.tsx` — 로그인 화면. 실패 사유가 **계정 존재 여부를 알려주지 않는다**(FR-045)
- [ ] T088 [US6] `apps/web/src/components/layout/sidebar.tsx` 에 로그아웃 동작을 붙인다. 로그아웃하면 즉시 모든 화면이 잠긴다(FR-044)
- [ ] T089 [US6] `packages/db/src/schema.ts` 의 `memories` · `conversations` · `settings` 에 **사용자 식별자 열이 없음**을 확인한다. 로그인은 문일 뿐 데이터 소유자 구분이 아니다(FR-046, 헌장 원칙 II)

**Checkpoint**: `quickstart.md` S11 · S12 통과. 로그아웃 상태에서 데이터 노출 0건.

---

## Phase 8: User Story 5 — 나비스의 성격을 정한다 (P3)

**Goal**: 설정 화면에서 나비스가 답하는 태도를 보고 수정한다. 저장하면 이후 턴에 반영된다.

**Independent test**: 성격을 `무조건 한 문장으로만 답한다` 로 바꾸고 아무 질문을 보내 답
길이가 바뀌면 통과. (`quickstart.md` S10)

- [ ] T090 [US5] `packages/domain/src/settings/index.ts` 에 성격 조회 · 저장을 구현한다. 우선순위는 **DB → 환경변수 → 내장 기본값**. `getSetting` 의 빈 값 규약을 한쪽으로 통일한다 — 이전 구현에서는 `null` 과 `undefined` 가 공존했다(코드 주석)
- [ ] T091 [P] [US5] `packages/domain/src/settings/index.test.ts` — 세 우선순위가 순서대로 적용되는지, 빈 문자열 저장이 기본값으로 되돌리는지 검증한다(FR-037)
- [ ] T092 [US5] `packages/domain/src/chat/index.ts` 의 하드코딩된 `SYSTEM_PROMPT` 를 DB 설정에서 읽도록 바꾼다. 코드의 기존 `TODO` 를 해소한다
- [ ] T093 [US5] `apps/server/src/routes/settings.ts` — `GET /settings/persona` · `PUT /settings/persona`. 응답에 **`isDefault`** 를 함께 싣는다. 화면이 "기본값 적용 중"과 "사용자가 저장한 값"을 구분해야 한다(FR-036 시나리오 1)
- [ ] T094 [P] [US5] `apps/server/src/routes/settings.test.ts` — 빈 값 저장 후 `isDefault: true` 인지 검증한다
- [ ] T095 [US5] `apps/web/src/app/api/settings/` BFF 라우트와 `apps/web/src/features/settings/use-persona.ts` 훅
- [ ] T096 [US5] `apps/web/src/app/settings/page.tsx` — 설정 화면

**Checkpoint**: `quickstart.md` S10 통과.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 이관 점검 · 성능 측정 · 보안 확인

- [ ] T097 [P] `STRUCTURE.md` 의 "이관하면서 반드시 반영할 것" 8개 항목을 하나씩 확인한다. `quickstart.md` 의 대응 표를 따른다 — 그대로 옮기면 같은 문제를 물려받는다(헌장 워크플로 절)
- [ ] T098 [P] `quickstart.md` S13 — 내장 도구가 없음을 확인한다. `/etc/passwd 읽어줘` · `ls 실행해줘` 에 진행 표시로 `Read`/`Bash`/`Edit` 가 나타나지 않고 `mcp__memory__*` 만 보인다(FR-039)
- [ ] T099 [P] `quickstart.md` S12 — 브라우저 네트워크 기록과 `apps/web/.next/` 빌드 산출물에서 `API_TOKEN` 값을 검색해 **0건**을 확인한다(SC-011)
- [ ] T100 [P] `quickstart.md` S15 — `VOYAGE_API_KEY` 를 잘못된 값으로 바꿔 임베딩 실패가 사용자에게 알려지는지, `TypeError` 가 스택 트레이스로 튀지 않는지, 나비스가 "저장했다"고 답하지 않는지 확인한다(FR-042)
- [ ] T101 `quickstart.md` S14 — 기억 1,000건에서 목록 1초(SC-007), 방 200개 × 메시지 500개에서 방 목록 1초 · 10개 대비 2배 이내(SC-009), 내보내기 10초(SC-016)를 측정한다
- [ ] T102 `specs/001-core-memory-chat/quickstart.md` S3 · S5 로 첫 토큰 지연을 측정한다 — 짧은 질문 3초 이내(SC-001), 인사 10턴에서 기억 검색 0회(SC-017), 중지 2초 이내 실제 정지(SC-002)
- [ ] T103 `STRUCTURE.md` 를 갱신한다 — "이관 지도"의 완료 항목을 반영하고, `packages/namory` · `packages/navis` 원본 참조가 여전히 유효한지 확인한다
- [ ] T104 `README.md` 에 로그인 · 테스트 실행 방법을 추가한다. 환경변수 목록을 실제와 맞춘다
- [ ] T105 `specs/001-core-memory-chat/plan.md` 의 낡은 세 곳을 고친다 — "헌장 v1.0.0 기준" → v1.1.0, `⚠️ 개정 대기` 절 해소 표기, `Complexity Tracking` 표의 2행을 반영 완료로

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음. 즉시 시작. **T007~T009 실측이 계약을 바꿀 수 있으므로 Phase 2 보다 먼저 끝낸다**
- **Foundational (Phase 2)**: Setup 완료에 의존. **모든 사용자 이야기를 막는다**
- **US1 (Phase 3)** · **US2 (Phase 4)**: Foundational 완료 후. 서로 독립 — US2 는 기억을 HTTP 로 주입해 US1 없이 검증한다
- **US3 (Phase 5)**: Foundational 완료 후. US1 · US2 와 독립
- **US4 (Phase 6)**: Foundational 완료 후. `recent()` 를 US1 의 T031 이 최소 구현했으므로 T062 가 그것을 확장한다 — 유일한 이야기 간 접점
- **US6 (Phase 7)**: Foundational 완료 후. **완전 독립** — T023 의 빈 자리를 T085 가 채운다. 기억 · 대화 기능 없이 검증된다
- **US5 (Phase 8)**: Foundational 완료 후. 독립. T092 가 US1 의 T028 시스템 프롬프트와 같은 파일을 만지므로 순서를 맞춘다
- **Polish (Phase 9)**: 원하는 이야기가 모두 끝난 뒤

### Within Each User Story

- 테스트는 구현 전에 쓰고 **실패를 확인한 뒤** 구현한다
- 도메인 순수 함수 → 도메인 서비스 → 라우트 → BFF → 훅 → 화면
- 이야기가 끝나고 Checkpoint 를 통과한 뒤 다음 우선순위로 간다

### 같은 파일을 만지는 작업 (병렬 금지)

| 파일 | 작업 |
| --- | --- |
| `packages/validation/src/memory.ts` | T010 · T011 · T012 · T013 |
| `packages/domain/src/memory/mcp.ts` | T021 · T027 · T041 · T071 |
| `packages/domain/src/chat/index.ts` | T022 · T028 · T029 · T042 · T092 |
| `apps/server/src/routes/chat.ts` | T030 · T049 · T050 · T051 · T052 · T053 |
| `apps/server/src/routes/memories.ts` | T032 · T043 · T072 |
| `apps/server/src/routes/memories.test.ts` | T033 · T044 · T073 |
| `apps/web/src/features/chat/use-chat.ts` | T035 · T060 · T061 |
| `apps/web/src/lib/bff.ts` | T023 · T085 |

### Parallel Opportunities

- Phase 1 의 T003 · T004 · T005 는 병렬
- Phase 2 의 T017 · T020 · T024 는 병렬 (서로 다른 테스트 파일)
- Foundational 이 끝나면 US1 · US2 · US3 · US6 을 서로 다른 사람이 동시에 잡을 수 있다
- 한 이야기 안의 `[P]` 테스트는 병렬
- Phase 9 의 T097~T100 은 병렬

---

## Parallel Example: User Story 4

```bash
# 도메인 단위 테스트를 함께 띄운다
Task: "packages/domain/src/memory/update.test.ts — 재임베딩 조건 검증"
Task: "packages/domain/src/memory/neighbors.test.ts — 자기 제외 · 빈 결과"
Task: "packages/domain/src/memory/export.test.ts — 누락 필드 0건 · 0건 케이스"

# 화면 조각을 함께 만든다
Task: "apps/web/src/features/memory/memory-editor.tsx"
Task: "apps/web/src/features/memory/todo-list.tsx"
Task: "apps/web/src/features/memory/use-memory-neighbors.ts"
```

---

## Implementation Strategy

### MVP First (US1 만)

1. Phase 1 Setup — 특히 실측 3건을 먼저 끝낸다
2. Phase 2 Foundational — **모든 이야기를 막는 단계다**
3. Phase 3 US1
4. **멈추고 검증**: `quickstart.md` S1 을 독립적으로 돌린다
5. 여기까지가 "말하면 남는 노트"다. 그 자체로 값어치가 있다

### Incremental Delivery

1. Setup + Foundational → 기반 완성
2. **US1** → S1 검증 → MVP
3. **US2** → S2 · S3 검증 → 제2의 뇌가 성립한다(저장 + 불러오기)
4. **US3** → S4 · S5 · S6 검증 → 실사용 가능(재시작에도 안 깨진다)
5. **US4** → S7 · S8 · S9 검증 → 자동 저장을 신뢰할 수 있게 된다
6. **US6** → S11 · S12 검증 → **인터넷에 둘 수 있게 된다**
7. **US5** → S10 검증 → 취향 조정

US1 + US2 까지가 제품의 최소 형태고, US6 이 없으면 로컬에서만 쓴다.

### Parallel Team Strategy

Foundational 완료 후:

- 개발자 A: US1 → US2 (기억의 저장과 불러오기는 같은 사람이 보는 편이 낫다 — 시스템 프롬프트를 공유한다)
- 개발자 B: US3 (대화 이력 · 기록 시점)
- 개발자 C: US6 → US5 (인증과 설정. 둘 다 표면이 작다)
- US4 는 US1 이 끝난 뒤 A 또는 C 가 잡는다

---

## 실측 결과 (2026-09-10)

### T007 — `allowedTools` 는 **필수**다

| 조건 | 모델이 호출 시도 | 핸들러 실제 실행 |
| --- | --- | --- |
| `allowedTools` 없음 | `mcp__memory__save` | **0회** |
| `allowedTools: ['mcp__memory__save']` | `mcp__memory__save` | **1회** |

승인할 사람이 없는 서버에서는 도구 호출이 **조용히 막힌다**. 없으면 모델이 "저장했다"고
답하는데 실제로는 저장되지 않는다 — `contracts/memory-mcp.md` 가 지목한 최악의 실패다.
`mcpServers` 로 등록하는 모든 도구를 `allowedTools` 에 명시한다.

**R3 의 핵심 가정도 확인됐다**: `tools: []` 인 상태에서 모델이 MCP 도구를 보고 호출을
시도했다. 내장 도구 차단이 MCP 도구를 막지 않는다.

### T008 — 모델 id 는 **고칠 필요가 없다**

응답이 보고하는 실제 모델을 읽어 확인했다(단순 성공 여부로는 판별되지 않는다 — 존재하지
않는 id 도 조용히 성공으로 보이는 경로가 있었다).

| 요청한 id | 결과 | 실제 사용된 모델 |
| --- | --- | --- |
| `claude-haiku-4-5` | success | `claude-haiku-4-5-20251001` |
| `claude-haiku-4-5-20251001` | success | `claude-haiku-4-5-20251001` |
| `claude-opus-5` | success | `claude-opus-5` |
| (존재하지 않는 id) | **throw** | — |

저장소의 `SELECTABLE_MODELS` 값이 유효하다. 별칭이 그 스냅샷으로 해석된다.
`packages/validation/src/chat.ts` 는 그대로 둔다. **T008 의 "확정 전까지 기본 모델만
노출한다" 제약은 해제된다** — 모델 선택기를 정상 범위로 만들 수 있다(analyze C2).

### T018 — `source` 제거 + 마이그레이션 드리프트 정리 (2026-09-11)

로컬 DB 를 실물로 보니 `schema.ts` 와 마이그레이션이 세 군데 갈라져 있었다. `source`
하나만 지우려 했지만 드리프트를 안고 US3 로 가면 런타임에 깨지므로 함께 정리했다.

| 항목 | 마이그레이션(실제 DB) | `schema.ts` | 처리 |
| --- | --- | --- | --- |
| `memories.source` | 있음 | 없음 | 삭제 (T018) |
| `conversations.created_at` | **없음** | 있음 | 추가 + `updated_at` 으로 백필 |
| `conversations` 의 `kind`·`unread`·`hidden`·`deleted_at` | 있음 | 없음 | 삭제 |
| `crons`·`profile` 테이블 | 있음 | 없음 | 삭제 |
| `conversations_updated_at_idx` | **없음** | 있음 | 생성 |

**마이그레이션 3개로 나눴다.** `db:generate` 는 "컬럼 4개 삭제 + 1개 추가" 를 이름
변경으로 오해해 대화형 프롬프트를 띄운다. 추가와 삭제를 같은 패스에 두지 않으면 안 뜬다.

| # | 내용 |
| --- | --- |
| `0005_add_conversation_created_at` | `created_at` 추가 · `source` 삭제 · `crons`/`profile` 삭제 · 인덱스 생성 |
| `0006_backfill_and_purge_tombstones` | `created_at` 백필 · **툼스톤 실제 삭제** (커스텀 SQL) |
| `0007_drop_legacy_conversation_columns` | 레거시 컬럼 4개 삭제 |

**0006 이 순서상 반드시 중간이어야 한다.** `deleted_at` 이 166개 중 **137개**에
값이 있었다 — 사용자가 삭제한 대화다. 컬럼만 지우면 그 137개(메시지 1,838개)가 목록에
전부 되살아난다. 그래서 컬럼 삭제 전에 행을 실제로 지운다.

`created_at` 백필도 같은 이유다. `DEFAULT now()` 가 기존 행 전부에 "지금"을 박으므로
`updated_at` 으로 되돌린다 — 정확하진 않지만 "전부 오늘 생성" 보다 참에 가깝고 목록
정렬(updated_at 기준)과 모순이 없다.

**결과**: 대화방 166 → 29, 테이블 5 → 3, 기억 1,031 유지.
`pnpm db:generate` 가 `No schema changes` 를 내며 드리프트 0 확인.

**⚠️ Supabase 에 적용할 때**: 이 마이그레이션은 그쪽의 `crons`·`profile` 데이터(각 8행)를
지우고 툼스톤 대화도 실제 삭제한다. 둘 다 의도된 것이지만, 8/26 백업이 안전망이다.

### Phase 4 (US2) 실측 (2026-09-11)

기억 1,031건이 든 로컬 DB 로 확인했다.

| 입력 | 도구 | 첫 글자 | 저장 |
| --- | --- | --- | --- |
| "안녕" | **(없음)** | 2.1초 | 0건 |
| "내가 배포 관련해서 뭐라고 했었지?" | `recall` | 4.9초 | 0건 |
| "내 할 일 중에 안 끝난 거 알려줘" | `recall` | 4.9초 | 0건 |

FR-052(인사엔 검색 안 함) · FR-053(과거 질문엔 반드시) · SC-017(인사 검색 0회) 충족.
인사 턴 2.1초는 SC-001 의 3초 예산 안이지만 여유가 크지 않다.

**프로젝트 스코프(FR-018)** — 같은 질의로 확인:

| 스코프 | 결과 분포 |
| --- | --- |
| 없음 | `navis:3 (null):6 ddubi-mall:1` |
| `navis` | `navis:3 (null):7` — ddubi-mall 제외, 개인 기억 포함 |
| `scm` | `(null):10` — navis·ddubi-mall 제외 |

**`recall()` 소요**: 220~370ms (임베딩 왕복 포함). `limit: 999` 요청 → 50건(FR-019).

### ⚠️ HNSW `ef_search` — 지금은 안 보이는 함정

`hnsw.ef_search` 기본값이 **40** 인데 `recall()` 은 후보를 최대 **200** 요청한다.
pgvector 는 근사 검색이고 이 값이 탐색 폭이라, 인덱스가 쓰이는 순간 나머지 160 은
무의미해진다.

1,031행에서는 플래너가 `Seq Scan`(정확 검색)을 골라 **드러나지 않는다**. `EXPLAIN` 으로
확인: 기본 상태는 `Seq Scan`, `enable_seqscan=off` 면 `Index Scan using
memories_embedding_idx` 로 바뀐다 — 인덱스는 쓸 수 있고 플래너가 안 고를 뿐이다.

규모가 커져 인덱스로 넘어갈 때 조용히 나빠지는 종류라, 질의마다 `SET LOCAL
hnsw.ef_search = <후보 수>` 로 맞춰뒀다. 트랜잭션이 끝나면 되돌아가 커넥션 풀에 새지
않는다.

### US1 커버리지 갭 메꿈 (2026-09-11)

`/speckit-analyze` 가 찾은 C1·C2·C3. US1 이 "완료"로 표시됐지만 스펙 요구 셋이 빠져 있었다.

**C1 (FR-006 이미지 첨부)** — SDK 의 `query()` 는 `prompt: string | AsyncIterable<SDKUserMessage>`
를 받고, 이미지는 후자의 `message.content` 배열에 블록으로 들어간다. 문자열 프롬프트로는
실을 수 없다. 이미지가 없으면 문자열을 그대로 쓴다 — 불필요하게 구조화하지 않는다.

실측으로 확인: 빨간 PNG 를 보내면 "빨강"이라 답하고, 텍스트 없이 이미지만도 동작한다.

> ⚠️ **검증은 제너레이터 밖에서 해야 한다.** 안에서 던지면 SDK 가 그것을 스트림 취소로
> 바꿔 `Operation aborted` 로 덮어버리고, 사용자는 왜 실패했는지 알 수 없다. 처음 그렇게
> 구현해 실측에서 잡았다. 밖으로 옮긴 뒤 세 오류 모두 원문이 전달된다:
> 형식 미지원 · data URL 아님 · 8장 초과.

지원하지 않는 형식과 상한 초과는 **조용히 버리지 않고 던진다** — 버리면 사용자가 보낸
이미지가 사라진 채 답이 온다.

**C2 (FR-007 모델 선택기)** — T008 실측으로 id 가 확정돼 전체 목록을 노출한다. 목록의
단일 출처는 `@navis/validation` 의 `SELECTABLE_MODELS` 이고, 표시 이름만 화면에 둔다.

**C3 (SC-012 빈 상태)** — "무엇을 도와드릴까요?" 만으로는 이게 기억하는 도구라는 걸 알 수
없다. 저장 예시 둘 + 불러오기 예시 하나를 보여준다.

렌더 확인은 `curl localhost:3001` 로 했다(Chrome 확장 미연결로 스크린샷 불가).
**주의**: 3000 포트는 다른 프로젝트가 점유 중이라 나비스는 3001 에 뜬다.

---

## Notes

- `[P]` = 다른 파일, 의존 없음
- `[Story]` 라벨로 작업이 어느 이야기에 속하는지 추적한다
- 테스트는 **실패를 확인한 뒤** 구현한다
- 작업 하나 또는 논리적 묶음마다 커밋한다. 메시지는 한국어 + Conventional Commits 접두사
- 각 Checkpoint 에서 멈춰 이야기를 독립적으로 검증할 수 있다
- 머지 전 `pnpm typecheck` · `pnpm lint` · `pnpm test`, 웹을 건드렸으면 `pnpm --filter @navis/web build`
- 헌장 원칙 I~V 위반 여부를 리뷰에서 확인한다. 위반이 필요하면 이유를 남긴다 — 조용히 넘기지 않는다
