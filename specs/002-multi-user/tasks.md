---
description: "여러 사람이 쓰는 나비스 — 회원마다 기억 분리 작업 목록"
---

# Tasks: 여러 사람이 쓰는 나비스 — 회원마다 기억 분리

**Input**: `specs/002-multi-user/` 의 spec.md · plan.md · research.md · data-model.md · contracts/ · quickstart.md

**Tests**: 포함한다. 이 기능의 성공 기준(SC-101 · SC-102 · SC-103)이 "새는 경우 0건"이라 테스트로
고정하지 않으면 나중 변경에서 조용히 깨진다. domain 은 **로컬 Postgres 실DB**(001 의
`packages/domain/src/memory/manage.test.ts` 방식, `DATABASE_URL` 없으면 skip), server 는 라우트 계약
테스트(domain mock).

**Organization**: 스토리별 단계. 회원 id 는 언제나 **첫 인자 `userId: string`** 이다(plan Summary 2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일 · 앞 작업 의존 없음 → 병렬 가능
- **[Story]**: US1~US5 (spec.md 의 사용자 스토리)

---

## Phase 1: Setup

- [X] T001 `apps/server/src/env.ts` 에 `ownerId: required("NAVIS_OWNER_ID")` 를 추가하고 **uuid 형식이 아니면 부팅 시 throw** 한다(research R2 — "없거나 uuid 가 아니면 server 가 뜨지 않는다"). `apps/server/.env.example` 에 설명과 함께 `NAVIS_OWNER_ID=` 를 추가한다("Supabase 대시보드 → Users 의 관리자 UID")
- [X] T002 [P] 서버 테스트 전부(`apps/server/src/app.test.ts` · `routes/{mcp,memories,conversations,settings,chat}.test.ts`)에 `vi.stubEnv("NAVIS_OWNER_ID", "00000000-0000-4000-8000-000000000001")` 를 추가해 T001 이후에도 부팅되게 한다
- [X] T003 [P] `packages/domain/src/test-users.ts` 를 만든다 — 테스트 전용 고정 회원 uuid 두 개(`USER_A`, `USER_B`)와 정리 헬퍼. 실DB 테스트가 같은 값으로 두 회원을 흉내 낸다(운영 코드에서 import 하지 않는다)

---

## Phase 2: Foundational (모든 스토리의 전제)

**⚠️ 이 단계가 끝나기 전에는 어느 스토리도 시작하지 않는다.**

- [X] T004 `packages/db/src/schema.ts` — `memories` · `conversations` · `settings` 에 `userId: uuid("user_id")` 를 **null 허용**으로 추가하고, 인덱스 `memories_user_created_idx (user_id, created_at desc)` · `conversations_user_updated_idx (user_id, updated_at desc)` 를 더한다. `pnpm db:generate` 로 `packages/db/migrations/0008_*.sql` 을 만든다 — **열 추가 + 인덱스만** 있어야 한다(NOT NULL · PK 변경은 T020 의 0009). 로컬 DB 에 `pnpm db:migrate` 로 적용한다
- [X] T005 `apps/server/src/app.ts` — 회원 판정(contracts/identity.md 표). `/health` 는 그대로, `/mcp` 는 `c.set("userId", env.ownerId)`(**헤더를 보지 않는다**), 그 밖은 `API_TOKEN` 통과 후 `x-navis-user` 를 읽어 uuid 면 그 값, `owner` 면 `env.ownerId`, **없음 · 그 밖은 401**. Hono 제네릭 `Variables: { userId: string }` 타입을 `apps/server/src/types.ts` 에 두고 `app` · 각 라우트가 쓴다
- [X] T006 [P] `apps/server/src/app.test.ts` — 헤더 판정 계약: 헤더 없음 401 · `"abc"` 401 · uuid 통과 · `owner` 통과 · `/mcp` 는 헤더를 보내도 무시하고 관리자로 판정(라우트 하나를 mock 해 `c.get("userId")` 를 돌려주게 해 확인)
- [X] T007 `apps/web/src/lib/bff.ts` — `requireSession` 이 회원을 돌려주게 바꾸고(`authenticated` → `session.userId`, `unconfigured` → `"owner"`), `proxyToServer` 가 `x-navis-user` 헤더를 붙인다. `FORWARDED_REQUEST_HEADERS` 화이트리스트는 그대로 두고 **브라우저가 보낸 `x-navis-user` 가 넘어가지 않는다**는 주석을 단다(research R1)
- [X] T008 [P] `apps/web/src/app/api/mcp/route.ts` 가 BFF 를 거치는지 확인한다 — 거친다면 `/mcp` 경로에는 `x-navis-user` 를 붙이지 않는다(server 가 무시하지만 헷갈리지 않게)

**Checkpoint**: 모든 요청이 회원을 갖고 server 에 도착한다. 아직 domain 은 회원으로 좁히지 않는다.

---

## Phase 3: User Story 1 — 내 기억은 나만 본다 (Priority: P1) 🎯 MVP

**Goal**: 기억 · 대화방의 모든 조회 · 수정 · 삭제가 그 회원으로 좁혀진다.

**Independent Test**: quickstart S2 · S3 — 두 회원의 데이터를 섞어 두고 목록 · 검색 · 이웃 · 할 일 · 프로젝트 · 내보내기 · 방 목록에서 남의 것 0건, 남의 id 로 고치기 · 지우기 · 열기 · 보내기 전부 404.

### Tests (먼저 쓰고 실패를 확인한다)

- [X] T009 [P] [US1] `packages/domain/src/memory/isolation.test.ts` — 실DB. `USER_A` · `USER_B` 로 같은 내용 · 같은 프로젝트 이름(`"navis"`)의 기억을 저장한 뒤: `recent` · `recall` · `todos` · `projects` · `exportAll` · `similarProjects` 결과에 상대 것이 0건, `neighbors(A, A의 id)` 에 B 의 기억이 없음(내용이 같아도), `update(A, B의 id)` · `remove(A, B의 id)` · `neighbors(A, B의 id)` 가 `NotFoundError` 이고 B 의 행이 바뀌지 않음, `renameProject(A, …)` 가 B 의 같은 이름 프로젝트를 옮기지 않음
- [X] T010 [P] [US1] `packages/domain/src/conversation/index.test.ts` 에 분리 케이스 추가 — `list(A)` 에 B 의 방 없음, `get(A, B의 방)` · `remove(A, B의 방)` · `removeMessage(A, B의 방, …)` 가 `NotFoundError`, `ensure(A, B의 방 id, …)` 가 `NotFoundError` 이고 B 의 방에 아무것도 붙지 않음(research R8)
- [X] T011 [P] [US1] `apps/server/src/routes/memories.test.ts` · `conversations.test.ts` — 라우트가 `c.get("userId")` 를 domain 의 **첫 인자**로 넘기는지(`expect(fn).toHaveBeenCalledWith(USER, …)`), 헤더의 회원이 다르면 다른 값이 넘어가는지 검증

### Implementation — domain

- [X] T012 [US1] `packages/domain/src/memory/scope.ts` 에 `ownedBy(userId)` = `eq(memories.userId, userId)` 를 두고, `save.ts` · `recent.ts` · `recall.ts` · `todos.ts` · `export.ts` 를 `userId` 첫 인자로 바꾼다. `save` 는 `user_id` 를 넣고, 나머지는 조건 배열의 **맨 앞**에 `ownedBy(userId)` 를 넣는다
- [X] T013 [US1] `packages/domain/src/memory/update.ts` · `remove.ts` · `neighbors.ts` — `userId` 첫 인자. id 로 찾는 모든 질의를 `and(eq(id), ownedBy(userId))` 로(남의 행 = 없음, data-model "남의 행은 없는 것과 같다"). `neighbors` 의 기준 벡터 서브쿼리와 후보 질의 **둘 다** 회원 조건을 건다
- [X] T014 [US1] `packages/domain/src/memory/projects.ts` — `projects` · `renameProject` · `similarProjects` 를 `userId` 첫 인자로, 모든 질의(트랜잭션 안의 대상 존재 확인 포함)를 회원으로 좁힌다(FR-105)
- [X] T015 [US1] `packages/domain/src/memory/recall.ts` · `neighbors.ts` 의 벡터 질의 트랜잭션에 `set local hnsw.iterative_scan = relaxed_order` 를 추가한다(research R5 — 회원 필터로 후보가 모자라지 않게). 주석에 "pgvector ≥ 0.8 필요, 운영 버전은 quickstart S0-3" 을 남긴다
- [X] T016 [US1] `packages/domain/src/memory/mcp.ts` — `createMemoryMcpServer({ userId, tally })` 로 바꾸고 모든 도구 핸들러가 클로저의 `userId` 를 첫 인자로 domain 을 부른다. **도구 입력 스키마는 바꾸지 않는다**(contracts/memory-mcp.md)
- [X] T017 [US1] `packages/domain/src/conversation/index.ts` — `list` · `get` · `ensure` · `appendMessage` · `setSessionId` · `remove` · `removeMessage` 를 `userId` 첫 인자로. `ensure` 는 같은 id 의 방이 **다른 회원의 것이면 `NotFoundError`**, 없으면 `user_id` 와 함께 만든다(research R8)
- [X] T018 [US1] `packages/domain/src/chat/index.ts` — `TurnInput` 에 `userId: string` 을 추가하고 `createMemoryMcpServer({ userId, tally })` 로 넘긴다(토큰은 US3 에서)

### Implementation — server

- [X] T019 [US1] `apps/server/src/routes/memories.ts` · `conversations.ts` · `chat.ts` — 모든 domain 호출에 `c.get("userId")` 를 첫 인자로. `chat.ts` 는 `conversation.ensure(userId, …)` 가 `NotFoundError` 면 **스트림을 열기 전에 404**(질문을 기록하지 않는다, contracts/identity.md), `inFlight` 값을 `{ controller, userId }` 로 바꾸고 `/cancel` 은 같은 회원의 턴만 abort — 아니면 `{ ok: true, found: false }`(research R7). `chat.test.ts` 에 이 두 케이스를 추가한다
- [X] T020 [P] [US1] `apps/server/src/routes/mcp.test.ts` 의 도구 목록 테스트가 그대로 통과하는지 확인한다(도구 이름 · 스키마는 바뀌지 않는다)

**Checkpoint**: T009~T011 통과. 로컬에서 관리자 계정과 다른 uuid 를 `x-navis-user` 로 직접 보내 S3 의 요청들이 404 인지 curl 로 확인한다.

---

## Phase 4: User Story 2 — 지금 쓰던 기억은 그대로 내 것이다 (Priority: P1)

**Goal**: 기존 행 전부가 관리자 것이 되고, 이후 주인 없는 행이 생길 수 없다.

**Independent Test**: quickstart S1 — 전환 전후 건수 일치(SC-103), 0009 성공(= null 0건), 새 회원은 빈 상태.

- [X] T021 [US2] `packages/db/src/assign-owner.ts` — `NAVIS_OWNER_ID`(uuid 검증)와 `DATABASE_URL` 을 받아 **트랜잭션 하나**에서 세 테이블의 `user_id is null` 행을 관리자로 채우고 테이블별 건수를 출력한다. 다시 돌려도 안전하다(이미 채워진 행은 건드리지 않는다). `packages/db/package.json` 에 `"assign-owner": "tsx --env-file-if-exists=../../apps/server/.env src/assign-owner.ts"` 를 추가한다
- [X] T022 [US2] `packages/db/src/schema.ts` — 세 `userId` 를 `.notNull()` 로, `settings` 의 PK 를 `primaryKey({ columns: [t.userId, t.key] })` 로 바꾸고 `pnpm db:generate` 로 `0009_*.sql` 을 만든다. 생성된 SQL 이 **NOT NULL 3개 + settings PK 교체만** 인지 확인한다. 로컬에서 T021 → `pnpm db:migrate` 순으로 적용한다
- [X] T023 [P] [US2] *(자동 테스트 대신 로컬 DB 에서 두 번 실행해 확인: 1회차 977 · 1 · 2건 채움, 2회차 0 · 0 · 0건)* `packages/db/src/assign-owner.test.ts`(또는 domain 쪽 실DB 테스트) — null 행이 관리자로 채워지고 이미 주인 있는 행은 그대로인지, 두 번 돌려도 건수가 0 인지 검증
- [X] T024 [US2] `deploy/service.yaml` server 컨테이너에 `NAVIS_OWNER_ID` ← `navis-owner-id` 비밀값을 추가하고, `deploy/README.md` 에 "다중 사용자 전환" 절을 쓴다 — quickstart S0~S1 순서(가입 끄기 → owner 비밀값 → 건수 기록 → 0008 → assign-owner → 0009 → 배포)와 0009 와 배포 사이 몇 분간 저장이 실패한다는 점

**Checkpoint**: 로컬 DB 에서 전환 전후 `count(*)` 가 같고, 관리자 uuid 로 `x-navis-user` 를 보내면 기존 기억 · 방이 그대로 보인다.

---

## Phase 5: User Story 3 — 각자 자기 Claude 토큰으로 대화한다 (Priority: P2)

**Goal**: 토큰 등록 · 조회 · 사용이 회원별이다.

**Independent Test**: quickstart S4 — B 는 미등록 안내, A 는 그대로 대화.

- [X] T025 [P] [US3] `packages/domain/src/settings/index.test.ts` — `USER_A` · `USER_B` 로: A 만 등록 → `status(B)` 미등록 · `resolve(B)` null, B 등록 후 A 의 끝 4자리가 바뀌지 않음, `remove(B)` 가 A 에 영향 없음, 캐시가 회원별로 갈라짐
- [X] T026 [US3] `packages/domain/src/settings/index.ts` — `claudeToken.status(userId)` · `set(userId, token)` · `remove(userId)` · `resolve(userId)`. 모든 질의를 `(user_id, key)` 로, upsert 의 `target` 을 `[settings.userId, settings.key]` 로, 캐시를 `Map<string, string | null>` 로 바꾼다(research R6). `resetCache()` 는 맵 전체를 비운다
- [X] T027 [US3] `packages/domain/src/chat/index.ts` — `claudeToken.resolve(input.userId)` 로 그 회원의 토큰을 쓴다. 다른 회원의 토큰으로 대신 답하는 분기가 없어야 한다(FR-111)
- [X] T028 [US3] `apps/server/src/routes/settings.ts` — 모든 호출에 `c.get("userId")`. `settings.test.ts` 의 mock 을 회원별 저장으로 바꾸고 "A 가 등록해도 B 의 GET 은 미등록" 케이스를 추가한다

**Checkpoint**: 서로 다른 `x-navis-user` 로 `/settings/claude-token` 을 부르면 각자의 상태가 나온다.

---

## Phase 6: User Story 4 — 관리자가 회원을 들인다 (Priority: P2)

**Goal**: 회원이 생기는 길은 관리자의 초대 · 생성뿐이고, 막힌 계정은 곧 막힌다.

**Independent Test**: quickstart S2-1 — 새 회원이 빈 나비스로 들어오고, 가입 수단이 없다.

- [X] T029 [US4] `apps/web/src/features/auth/login-form.tsx` · `login-brand.tsx` 에 가입 버튼 · 링크가 없는지 확인하고, 로그인 실패 안내 아래에 "계정은 관리자에게 요청하세요" 한 줄을 둔다(FR-109)
- [X] T030 [US4] 막힌 계정의 차단 시점을 정한다(FR-108). 지금 BFF 는 `getClaims()`(서명만 검증)라 막힌 계정도 **액세스 토큰이 만료될 때까지**(Supabase 기본 1시간) 통과한다. 결정: Supabase 대시보드에서 JWT 만료를 **10분**으로 줄이고, 즉시 막아야 하면 대시보드의 "Sign out user"(세션 폐기)를 쓴다 — 요청마다 `getUser()` 왕복(목록 · 검색마다 수십~수백 ms)을 붙이지 않는다(헌장 성능 절). spec.md FR-108 의 문구를 "다음 요청부터" → "액세스 토큰 만료(10분) 안에, 세션을 폐기하면 즉시"로 고치고, research.md 에 R10 으로 적는다
- [X] T031 [P] [US4] quickstart S0-1(가입 끄기) · S0-2(관리자 UID) 와 회원 만들기("Invite user" / "Add user")를 `deploy/README.md` 의 전환 절에 운영 순서로 적는다

---

## Phase 7: User Story 5 — Claude Code 연결은 관리자 것이다 (Priority: P3)

**Goal**: 외부 MCP 로 들어오는 저장 · 검색 · 수정은 관리자의 기억이다.

**Independent Test**: quickstart S5.

- [X] T032 [US5] `apps/server/src/routes/mcp.ts` — `createMemoryMcpServer({ userId: c.get("userId"), tally: { saved: 0 } })`(T005 가 `/mcp` 의 회원을 관리자로 고정했다)
- [X] T033 [P] [US5] *(apps/server/src/identity.test.ts 의 "/mcp 는 헤더를 보지 않고 관리자로 판정한다" 로 검증)* `apps/server/src/routes/mcp.test.ts` — `x-navis-user` 에 다른 uuid 를 실어 보내도 MCP 도구가 관리자 회원으로 domain 을 부르는지 검증(domain 의 `save` 를 mock 해 첫 인자를 확인)

---

## Phase 8: Polish & Cross-Cutting

- [X] T034 [P] `specs/001-core-memory-chat/contracts/server-http.md` · `memory-mcp.md` 머리에 "002 이후 모든 요청은 회원을 갖는다 — specs/002-multi-user/contracts/identity.md" 를 적고, 001 spec FR-046 에 "002 로 대체" 표시를 단다
- [X] T035 [P] `README.md` 의 환경변수 목록에 `NAVIS_OWNER_ID` · `NAVIS_SETTINGS_KEY` 를 넣고 `CLAUDE_CODE_OAUTH_TOKEN` 언급을 지운다. "다중 사용자 — 회원은 관리자가 Supabase 에서 만든다" 한 단락을 추가한다
- [X] T036 `pnpm -r typecheck` · 웹 `eslint` · domain · server 테스트 전부 통과를 확인한다. `grep -rn "createMemoryMcpServer(\|claudeToken\.\(status\|set\|remove\|resolve\)(" packages apps --include=*.ts` 로 회원 인자 없는 호출이 0건인지 본다
- [X] T037 로컬에서 quickstart S2 · S3 · S4 를 실제로 돌린다 — `x-navis-user` 로 두 회원을 흉내 내 BFF 아래(server)를 curl 로, 로그인이 켜진 환경이 있으면 브라우저로. 결과를 이 파일 끝에 적는다
- [X] T038 `.specify/memory/constitution.md` v2.0.0 의 원칙 II 문구와 구현이 맞는지(헤더 이름 · `NAVIS_OWNER_ID` · 404 규칙) 다시 대조한다

---

## Dependencies & Execution Order

```
Phase 1 (T001~T003)
  └─ Phase 2 (T004 스키마 → T005 판정 → T007 BFF)       ← 모든 스토리의 전제
       ├─ US1 (T009~T020)   🎯 MVP — 분리 자체
       │    └─ US2 (T021~T024) — NOT NULL 은 분리 코드가 user_id 를 항상 넣은 뒤에
       │         └─ US3 (T025~T028) — settings PK (user_id, key) 가 0009 에서 생긴다
       ├─ US4 (T029~T031)   — 코드 의존 거의 없음, 문서 · 운영 결정
       └─ US5 (T032~T033)   — US1 의 T016 (MCP 클로저) 뒤
  └─ Polish (T034~T038)
```

- **US2 는 US1 뒤**: 0009(NOT NULL)를 먼저 걸면 아직 `user_id` 를 넣지 않는 저장이 전부 실패한다.
- **US3 는 US2 뒤**: 회원별 upsert 의 대상 `(user_id, key)` 가 0009 의 PK 다.
- **배포는 US1~US3 가 모두 끝난 뒤 한 번** — 중간 상태(회원 판정은 있는데 domain 이 안 좁힘)를 운영에 내지 않는다.

## Parallel Examples

**US1 테스트 먼저 (서로 다른 파일)**
```
T009 memory/isolation.test.ts
T010 conversation/index.test.ts
T011 server routes 계약
```

**US1 domain 구현** — T012~T015 는 memory 의 서로 다른 파일이지만 `scope.ts` 의 `ownedBy` 를 T012 가 만든다 → T012 먼저, 이후 T013 · T014 · T015 병렬. T017(conversation)은 memory 와 독립이라 T012 와 병렬.

**US4 · US5** 는 US2 · US3 와 병렬로 진행할 수 있다(파일이 겹치지 않는다).

## Implementation Strategy

1. **MVP = Phase 1 + 2 + US1** — 로컬에서 두 회원 분리가 성립하는지 테스트로 확인. 운영에는 아직 내지 않는다.
2. **US2** — 로컬 DB 로 전환 리허설(건수 일치 확인).
3. **US3** — 회원별 토큰.
4. **US4 · US5 · Polish** — 운영 결정 · 문서 · 마지막 대조.
5. **운영 전환** — quickstart S0 → S1(마이그레이션 + 배포) → S2~S6 확인. 배포는 한 번.

---

## 구현 결과 (2026-10-08, T037)

로컬 스택(web unconfigured · server · 로컬 Postgres)에서 server 를 `x-navis-user` 로 직접 불러 확인했다.

| 확인 | 결과 |
| --- | --- |
| 서버 토큰만 있고 회원 헤더 없음 | 401 |
| 관리자(owner) 기억 목록 | 기존 기억 그대로(상한 500 꽉 참) |
| 새 회원 B 의 기억 · 방 · 토큰 | 0건 · `[]` · 미등록 |
| B 가 관리자 기억 삭제 · 수정 · 이웃, 방 조회 · 삭제 · 채팅 | 전부 404, 관리자 데이터 그대로 |
| B 가 저장한 기억 — 관리자 검색 / B 검색 | 0건 / 1건 |
| 브라우저가 `x-navis-user` 로 B 를 주장(BFF 경유) | 무시됨 — 세션의 회원(owner)으로 처리 |

테스트: domain 179 · server 84 통과(분리 테스트 포함). 로그인이 켜진 브라우저 두 계정으로의 확인은
운영 전환 뒤 quickstart S2 로 한다.

**운영 전환 (2026-10-08)**: 리비전 `navis-00013` 배포 완료. 전환에 쓴 일회성 도구(`assign-owner` ·
`migrate-to` · `deploy/migrate-multi-user.sh`)는 끝난 뒤 지웠다.
