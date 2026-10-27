---

description: "Task list — 주제 대화"
---

# Tasks: 주제 대화 — 주제마다 방을 나누고, 그 방이 어떤 기억을 바탕으로 하는지 보이게

**Input**: Design documents from `/specs/005-topic-rooms/`

**Prerequisites**: plan.md, spec.md, research.md(R1–R10), data-model.md, contracts/http.md, contracts/memory-tools.md, quickstart.md

**Tests**: 포함한다. 헌장 품질 게이트대로 결정적인 것만 — domain 순수 함수 · 실제 DB, server `app.fetch()` 계약. 모델 판단(초점이
맞는지, 넓히기 · 개인 사실 분류)은 quickstart 수동 시나리오로.

**Organization**: 스토리별 단계. US1 이 MVP 다(만들기 + 초점 + 최소 방 메뉴). US2 는 칩, US3 는 방 목록 다듬기 · 지우기 · 알림.

> **⏸ 보류 (2026-10-23 사용자 결정)** — 구현하지 않는다. 이유:
> 1. 초점이 기억의 프로젝트 이름에 기대는데, 프로젝트는 대화 중 모델이 붙여 온 것이라 표기가 흩어져 있다(운영: 한 회원 39개).
>    표기가 다른 주제의 기억이 조용히 빠져 "왜 기억 못 해?"로 보이고, 화면에선 이유가 드러나지 않는다.
> 2. 다른 회원은 주제가 2–3개뿐이라 주제 방이 대부분 '기억 없음'으로 시작한다 — 고르는 단계만 늘어난다.
> 3. 방이 생기면 "어디서 말하지?"가 생기고, "말하면 기억한다"는 단순함이 줄어든다.
>
> 대신: (1) 답마다 '참고한 기억' 표시 — 어떤 기억을 바탕으로 했는지를 방이 아니라 답 단위로 보인다. (2) 정말 필요해지면 기억을
> 좁히지 않는 그냥 새 대화방. 다시 꺼낼 때는 주제 표기 정리 + 방 위의 범위 표시를 조건으로 한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일 · 미완료 작업에 의존하지 않아 병렬 가능
- **[Story]**: US1 · US2 · US3

---

## Phase 1: Setup

- [ ] T001 `.specify/memory/constitution.md` 를 v2.4.0(MINOR)으로 개정한다(research R10). **단독 커밋.**
  - 보안 절 "in-process MCP 서버는 다섯뿐" → **여섯**: `feedback`(**회원의** 대화 턴에만 — `send`. 관리자 · 약속 · 전하기 턴과 외부
    MCP 에는 열지 않는다)을 더한다(b815051 에서 이미 들어온 것을 문서에 맞춘다).
  - 원칙 I 의 "기능을 더하는 PR 은 셋 중 무엇인가" 예로 한 줄: 주제 대화 = 대화(방을 주제로 나누고, 기억 범위를 방에 맞춘다).
  - `Version: 2.4.0`, `Last Amended: 2026-10-23`.

---

## Phase 2: Foundational (모든 스토리의 전제)

### 스키마 · 계약

- [ ] T002 `packages/db/src/schema.ts` 의 `conversations` 에 `project: text("project")`(**null 허용** — "null 이면 주제 없는 방")를
  더하고, 인덱스 `conversations_user_project_idx` 를 `(user_id, project) where project is not null` 로 건다. **유일 인덱스가 아니다**
  — 주제를 합치면 같은 주제 방이 둘이 될 수 있고 둘 다 남긴다(research R2). 이유를 주석으로.
- [ ] T003 `pnpm db:generate` 로 `packages/db/migrations/0016_*.sql` 을 만들고(이름 `topic_rooms`) 내용이 열 추가 + 인덱스뿐인지 확인한다.
  로컬에 `pnpm db:migrate`.
- [ ] T004 [P] `packages/validation/src/conversation.ts`:
  - `conversationSchema` 에 `project: z.string().nullable()`.
  - `conversationSummarySchema` 에 `memoryCount: z.number().int().nullable()`(주제 방이면 그 주제의 기억 수, 아니면 null).
  - 새 `topicRoomCreateInputSchema = z.object({ project: z.string().trim().min(1).max(100) })` 와 타입.
- [ ] T005 [P] `packages/validation/src/memory.ts`:
  - `recallInputSchema` · `recentInputSchema` · `todosInputSchema` 에 `everywhere: z.boolean().optional()`.
  - `saveInputSchema` 에 `personal: z.boolean().optional()`.
  - 각 필드에 "주제 방(focus)에서만 뜻이 있다 — 없으면 무시"를 주석으로(contracts/memory-tools.md).

### 초점 — 순수 규칙

- [ ] T006 `packages/domain/src/memory/focus.ts` 를 새로 만든다. 순수 함수 둘(contracts/memory-tools.md 표 그대로):
  - `focusQuery(args, focus?)` — `recall` · `recent` · `todos` 입력에 focus 를 적용한 실제 입력을 돌려준다. focus 없음 → 그대로.
    `project` 가 있으면 그대로(입력이 이긴다). `everywhere: true` → 좁히지 않음. 그 밖 → `project = focus`. 결과에서 `everywhere` 는 뺀다.
  - `focusSave(args, focus?)` — `personal: true` → `project` 없음(personal 이 이긴다). `project` 있음 → 그대로. 그 밖 → `project = focus`.
    결과에서 `personal` 은 뺀다.
  - `scopeLabel(args, focus?)` — 응답 첫 줄용 "범위: 이사 + 개인 기억" / "범위: 모든 기억".
- [ ] T007 [P] `packages/domain/test/memory/focus.test.ts` — T006 의 표 전부: focus 없음 · project 있음 · everywhere · project+everywhere ·
  personal · personal+project · 라벨.

**Checkpoint**: `pnpm --filter @navis/domain test` 통과, 기존 기억 · 대화 테스트 회귀 없음.

---

## Phase 3: User Story 1 — 주제 방을 만들고 그 주제로 대화한다 (P1) 🎯 MVP

**Goal**: 방 메뉴에서 주제 방을 만들고 열면, 그 방의 나비스가 그 주제 + 개인 기억으로 찾고, 새 기억을 그 주제로 남긴다.

**Independent Test**: quickstart 수동 1–7, 13, 15.

### 기억 도구 · 턴

- [ ] T008 [US1] `packages/domain/src/memory/mcp.ts` — `MemoryMcpContext` 에 `focus?: string`. `save` 는 `focusSave`, `recall` · `recent` ·
  `todos` 는 `focusQuery` 를 거쳐 domain 을 부르고, 응답 첫 줄에 `scopeLabel` 을 붙인다(focus 가 있을 때만). 도구 설명에 한 줄씩:
  `everywhere`("사용자가 전체에서 · 다른 데서 얘기한 것도 찾으라고 할 때만"), `personal`("사용자 자신에 관한 사실 — 생일 · 취향 · 건강 · 가족").
  외부 MCP(`apps/server` 의 `/mcp`)는 focus 를 넘기지 않으므로 그대로다 — 확인만.
- [ ] T009 [US1] `packages/domain/src/chat/index.ts`:
  - `TurnInput` 에 `focus?: string`("주제 방의 주제. 약속 · 전하기 턴에는 없다").
  - `buildTurnTools` 가 대화 턴에서만 `createMemoryMcpServer({ …, focus })` 를 넘기고, focus 가 있으면 `TOPIC_PROMPT(focus)` 절을
    붙인다(contracts/memory-tools.md "이 방의 주제" 다섯 줄 — 넓히기 · personal · 다른 project · 약속은 나비스 방으로(FR-020) · 먼 얘기면
    옮길지 한 번 제안). 약속 · 전하기 턴에서는 focus 를 무시한다.
- [ ] T010 [P] [US1] `packages/domain/test/chat/turn-tools.test.ts` — focus 있는 대화 턴엔 "## 이 방의 주제"와 주제 이름이 있고, focus 없는
  대화 턴 · 약속 턴 · 전하기 턴(focus 를 줘도)에는 없다.

### 방

- [ ] T011 [US1] `packages/domain/src/conversation/index.ts`:
  - `ensure()` 의 `columns` 와 `RoomSession` 에 `project` 를 더한다(추가 조회 없음 — research R8).
  - 새 `openTopicRoom(userId, project): Promise<{ room: ConversationSummary; created: boolean }>` — `project` 를 trim 하고, 같은 회원 ·
    같은 `project` 의 방이 있으면 `updatedAt` 최근 것을 돌려주고(created false), 없으면 `title = project`, `project`, `isMain false` 로 만든다.
  - `list()` — `where userId and (isMain or project is not null)`(주제 없는 예전 방 숨김, 스펙 결정 A), 요약에 `project`,
    `memoryCount` 는 같은 함수에서 `projects(userId)` 를 한 번 불러 `project` 로 맞춘다(없으면 0, 주제 없으면 null).
  - `get()` 응답에 `project`.
- [ ] T012 [P] [US1] `packages/domain/test/conversation/index.test.ts`(실 DB) — `openTopicRoom` 이 같은 주제에 두 번째로 불리면 같은 방 ·
  created false, 다른 회원의 같은 주제는 다른 방. `list()` 가 주제 없는 비메인 방을 빼고 `memoryCount` 를 맞춘다.
- [ ] T013 [US1] `apps/server/src/routes/conversations.ts` — `POST /` 추가: `topicRoomCreateInputSchema` 검증 실패 400, 성공 시 새로
  만들었으면 201 · 있었으면 200 으로 요약을 돌려준다. 파일 위의 "방 생성 전용 엔드포인트는 만들지 않는다" 주석을 "주제 방은 첫 메시지
  전에 칩이 보여야 하고 '있으면 연다'를 해야 해서 만든다(specs/005 R5). 일반 방 생성은 여전히 POST /chat 이 겸한다"로 고친다.
  `app.ts` 상단 라우트 목록 주석도 갱신.
- [ ] T014 [US1] `apps/server/src/routes/chat.ts` — `conversation.ensure()` 결과의 `project` 를 `chat.runTurn({ …, focus: room.project ?? undefined })` 로 넘긴다.
- [ ] T015 [P] [US1] `apps/server/test/routes/conversations.test.ts` — `POST /conversations` 400(빈 이름 · 101자) · 201 · 200(이미 있음),
  목록 응답에 `project` · `memoryCount`. `apps/server/test/routes/chat.test.ts` — 주제 방이면 `runTurn` 에 `focus` 가 실린다.

### 웹

- [ ] T016 [P] [US1] `apps/web/src/app/api/conversations/route.ts` 에 `POST` 를 더한다(`proxyToServer(request, { path: "/conversations" })`).
- [ ] T017 [P] [US1] `apps/web/src/store/open-room-store.ts` — zustand `{ roomId: string | null; open(id); reset() }`. 저장하지 않는다(앱을
  열면 "나비스" — FR-018). `onboarding-store.ts` 와 같은 모양.
- [ ] T018 [US1] `apps/web/src/hooks/pages/conversation/use-conversation-workspace.ts` — 열린 방 = 스토어의 `roomId` 가 목록에 있으면 그것,
  아니면 "나비스" 방. `{ mainId, roomId, room, rooms, refresh }` 를 돌려준다. 주석의 "늘 나비스 방 하나다"를 고친다.
- [ ] T019 [P] [US1] `apps/web/src/hooks/apis/conversation/use-open-topic-room.ts` — `POST /api/conversations` mutation. 성공하면 목록 캐시에
  넣고(있으면 교체) 스토어 `open(id)`. 실패는 토스트.
- [ ] T020 [US1] `apps/web/src/features/rooms/new-topic-dialog.tsx` + 훅 `use-new-topic.ts` — 기존 주제 목록(`use-memory-project-list`,
  기억 많은 순) 버튼 + 새 이름 입력. 새 이름의 `projectKey` 가 기존 주제와 같으면 "'이사'를 쓸까요?"로 기존 것 / 새로 둘 중 고르게(FR-002).
  만드는 동안 버튼 잠금(research R2).
- [ ] T021 [US1] `apps/web/src/features/rooms/room-menu.tsx` + 훅 — 위쪽 바 왼쪽 "나비스" 글자 자리에 `지금 방 제목 ▾` 드롭다운: "나비스"(맨
  위) · 주제 방들 · 구분선 · "+ 새 주제 대화"(다이얼로그 열기). 고르면 스토어 `open`. `components/layout/top-bar.tsx` 의 `<span>나비스</span>` 를
  이것으로 바꾼다.
- [ ] T022 [US1] `apps/web/src/components/layout/workspace.tsx` — `ChatPanel key={roomId} conversationId={roomId}` 로 열린 방을 그린다.
  "나비스" id 가 오기 전엔 지금처럼 그리지 않는다.

**Checkpoint**: quickstart 1–7, 13, 15 를 사람이 확인. 이 상태로 배포해도 쓸 수 있다(칩 · 지우기 없이).

---

## Phase 4: User Story 2 — 방이 무엇을 바탕으로 하는지 한눈에 본다 (P2)

**Goal**: 주제 방 위쪽 칩 '📁 이사 · 기억 23개', 누르면 그 주제의 기억 목록.

**Independent Test**: quickstart 4(숫자 +1), 8.

- [ ] T023 [US2] `apps/web/src/features/rooms/topic-chip.tsx` + 훅 `use-topic-chip.ts` — 열린 방이 주제 방일 때만 채팅 패널 위 한 줄:
  `📁 {project} · 기억 {memoryCount}개`, 0 이면 `📁 {project} · 아직 기억 없음`(FR-014). 누르면 `Sheet`: `useMemoryList({ project,
  exactProject: true })` 최근순 목록, 위에 "개인 기억도 함께 써요" 한 줄(FR-012), 기억을 누르면 기억 화면과 같은 상세. "나비스" 방에는
  없다(FR-011). `ChatPanel` 에 props 를 늘리지 않고 `workspace.tsx` 에서 패널 위에 둔다(원칙 V).
- [ ] T024 [US2] 턴이 끝난 뒤 개수 · 목록이 맞게 — `use-conversation-workspace.ts` 의 `refresh` 가 방 목록과 함께 `["memory"]` 쿼리를
  무효화한다(FR-013, 기존 `invalidate-memory.ts` 를 쓴다).

**Checkpoint**: quickstart 4, 8.

---

## Phase 5: User Story 3 — 방을 바꾸고, 정리한다 (P3)

**Goal**: 방 메뉴 최근순 · 기억 개수 · 지금 방 표시, 주제 방 지우기, 이름 바꾸기 따라가기, 알림이 그 방을 연다.

**Independent Test**: quickstart 10–12, 14.

- [ ] T025 [US3] `room-menu.tsx` — 주제 방 항목에 기억 개수(작게), 지금 열린 방에 체크 표시. 방이 많으면 메뉴 안에서 스크롤(FR-015).
- [ ] T026 [P] [US3] `apps/web/src/hooks/apis/conversation/use-delete-conversation.ts` 를 되살린다(97fba81 에서 지운 것 — `git show
  97fba81^:apps/web/src/hooks/apis/conversation/use-delete-conversation.ts` 참고). 지운 뒤 스토어 `reset()`(→ "나비스" 방, FR-017).
- [ ] T027 [US3] `topic-chip.tsx` 의 시트 아래 "이 방 지우기" — 확인 다이얼로그("대화 기록은 지워지고, 이 주제의 기억은 남아요") 후
  T026 을 부른다.
- [ ] T028 [US3] `packages/domain/src/memory/projects.ts` 의 `renameProject` — 같은 트랜잭션에서 그 회원의 `conversations.project = from`
  방들을 `project = to, title = to` 로 바꾼다(FR-004, research R7). 합치기로 같은 주제 방이 둘이 되어도 둘 다 둔다.
- [ ] T029 [P] [US3] `packages/domain/test/memory/manage.test.ts`(실 DB, 기존 rename 테스트 옆) — 이름 바꾸기 뒤 방의 project · title 이
  따라오고, 남의 방은 바뀌지 않는다.
- [ ] T030 [US3] `apps/web/src/components/layout/workspace.tsx` — `usePushBridge(open)` 에 스토어 `open` 을 넘긴다(FR-021). 주석의 "방이
  하나라 옮길 일이 없다"를 고친다. 기억 화면에서 이름을 바꾼 뒤 방 목록이 새로 오도록 `use-rename-memory-project.ts` 의 성공 처리에 대화
  목록 무효화를 더한다.

**Checkpoint**: quickstart 10–12, 14.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T031 [P] `packages/domain/src/guide/index.ts` — 새 항목 `topic-rooms`("주제 대화 — 주제마다 방 나누기"): 위쪽 바 왼쪽 방 이름 ▾ →
  '새 주제 대화', 주제 = 기억 화면의 프로젝트, 그 방은 그 주제 + 개인 기억으로 찾고 그 주제로 남김, "전체에서 찾아줘"로 넓히기, 칩 →
  기억 목록 · 이 방 지우기(기억은 남음), 약속 · 알림은 "나비스" 방. `screens` 항목의 위쪽 바 설명에 방 메뉴를 더하고 "대화방은 '나비스'
  하나" 문장을 고친다. `packages/domain/test/guide/index.test.ts` 에 항목이 보이는지 한 줄.
- [ ] T032 [P] `apps/web/src/features/onboarding/tour-steps.ts` 는 바꾸지 않는다(FR-023) — 위쪽 바 왼쪽 요소가 바뀌어 `data-tour`
  선택자가 깨지지 않는지만 확인한다.
- [ ] T033 `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @navis/web build` 통과.
- [ ] T034 quickstart 수동 시나리오 1–15 를 돌리고, SC-002 · SC-003 · SC-004 를 주제 둘로 10번씩 판정해 결과를 `quickstart.md` 끝에 적는다.
- [ ] T035 운영 배포 전에 운영 DB 에 0016 을 적용한다(`deploy/README.md` — 운영 URL 은 Secret Manager `navis-database-url`).

---

## Dependencies & Execution Order

- **T001** → 전부(헌장 먼저, 단독 커밋).
- **Phase 2**(T002–T007) → 모든 스토리. T002 → T003. T004 · T005 · T006 은 병렬, T007 은 T006 뒤.
- **US1**(T008–T022): T008 → T009 → T010. T011 → T012 · T013 · T014 → T015. 웹 T016 · T017 · T019 병렬 → T018 → T020 → T021 → T022.
- **US2**(T023–T024): US1 의 T018 · T022 뒤(열린 방 · 목록의 `memoryCount`).
- **US3**(T025–T030): US1 뒤. T028 → T029. T026 → T027(T023 의 시트 필요).
- **Polish**: 스토리 다 뒤. T035 는 배포 직전.

## Parallel Examples

```text
# Phase 2
T004 validation/conversation.ts  |  T005 validation/memory.ts  |  T006 domain/memory/focus.ts

# US1 — domain 과 web 기반을 나란히
T008 → T009 (domain 기억 · 턴)   |  T011 (domain 방)   |  T016 BFF POST  |  T017 스토어  |  T019 열기 mutation

# US3
T026 delete 훅  |  T028 → T029 rename 이 방을 옮김
```

## Implementation Strategy

1. **T001 헌장 개정** 단독 커밋.
2. **Phase 2 + US1 = MVP**: 주제 방을 만들고 열고, 초점이 걸린다. 여기서 멈춰 사용자 확인 — 칩 없이도 "주제별 채팅"은 된다.
3. **US2 칩**: 바탕 기억이 보인다. 확인.
4. **US3 정리**: 지우기 · 이름 따라가기 · 알림. 확인.
5. **Polish**: 안내서 · 전체 게이트 · 수동 판정 · 운영 마이그레이션 → push.

단계마다 멈추고 사용자에게 확인받는다(사용자 메모리 "One step at a time").
