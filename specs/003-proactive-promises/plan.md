# Implementation Plan: 먼저 말 거는 나비스 — 약속

**Branch**: `main` (전용 브랜치 없음) | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-proactive-promises/spec.md`

## Summary

나비스가 미래의 자기에게 남기는 **약속** 하나를 재료로 들여, 묻지 않아도 먼저 말을 걸게 한다.

- 약속은 대화에서 in-process MCP 도구(`promise`)로 만든다.
- 바깥의 Cloud Scheduler 가 1분마다 내부 tick 을 부른다. tick 은 기한이 된 약속을 행 잠금 + 임대로 선점하고,
  평소와 같은 에이전트 턴을 직렬로 돌린다. 같은 회원의 대화 턴이 진행 중이면 양보한다.
- 약속 턴은 전용 도구 `notify` 를 부를 때만 회원마다 하나인 고정 "나비스" 방에 메시지를 남기고 웹 푸시를 보낸다.
  기본은 침묵이다.
- "나비스" 방이 끝없이 길어져도 느려지지 않게 두 가지를 바꾼다.
  - 메시지 저장을 jsonb 배열에서 한 줄 한 메시지 표로 옮긴다. 추가는 한 행만 쓰고, 화면은 최근 50개씩 읽는다.
  - 에이전트 세션을 30턴마다 교체하고 최근 20개 기록으로 잇는다.
- 구현 첫 커밋은 헌장 v2.1.0 개정이다.

## Technical Context

**Language/Version**: TypeScript 5 (strict, `noUncheckedIndexedAccess`), Node ≥ 22, ESM

**Primary Dependencies**:
- 기존: Hono, Next 16 / React 19, drizzle-orm, `@anthropic-ai/claude-agent-sdk`, web-push, zod
- **신규**: `cron-parser`(domain, 버전 고정) — R6

**Storage**: Supabase Postgres. 신규 표 `promises` · `promise_runs` · `messages`, `conversations` 열 변경(data-model.md)

**Testing**: Vitest
- domain 순수 함수: 일정 검증 · 다음 회차 · 세션 교체 판정 · 메시지 매핑
- server 계약(`app.fetch()`): tick 자격 · 약속 CRUD 분리 · 메인 방 409 · 메시지 페이지

**Target Platform**: Google Cloud Run(asia-southeast1) 단일 서비스, web ingress + server 사이드카, 최대 인스턴스 1,
minScale 0 + Cloud Scheduler 작업 1개

**Project Type**: 웹 서비스 모노레포(pnpm + turbo)

**Performance Goals**
- 약속 지연: 95%가 3분 이내(SC-001)
- 약속 동시 실행 중 대화 첫 응답: +20% 이내(SC-003)
- 메시지 500개 방: 첫 응답 +20% 이내, 방 열기 1초 이내(SC-004)
- 빈 tick: 1초 미만, 모델 호출 0(SC-006)

**Constraints**
- 응답 후 CPU 스로틀 → tick 이 실행을 끝까지 붙든다(R2)
- server 메모리 1Gi → 약속 턴 직렬(R4)
- 반복 최소 1시간, 켜진 약속 20개

**Scale/Scope**: 회원 수 명(관리자 + 초대 회원), 회원당 약속 20개 이하, 메인 방 메시지 연 수천~수만

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 핵심만 남긴다** | ⚠️ **개정 필요** | 크론 · 알림이 "의도적으로 제거된 기능"으로 적혀 있다. 이 기능은 둘 다 들인다. → **구현 첫 커밋에서 헌장을 v2.1.0 으로 개정한다(R12, FR-030).** "이게 셋 중 무엇인가"의 답은 **대화**다. 약속은 나비스가 나중의 자기에게 거는 대화다. 고정 능동 기능을 코드로 만들지 않는다는 조항으로 범위를 묶는다. 이미 들어온 웹 푸시(f561eba)도 이 개정으로 근거를 얻는다 |
| **II. 의존은 아래로만** | ✅ | DB · Agent SDK 를 아는 것은 `packages/domain` 뿐이다(promise 도메인 · 도구 · 세션 규칙). 프로세스 로컬 상태(직렬 큐 · 진행 중 턴 레지스트리)는 기존 `inFlight` 처럼 `apps/server` 에 둔다. web 은 `@navis/api` 로만 부른다. 회원 id 는 도구 생성 인자이고 도구 입력 스키마에 없다. tick 토큰 검증은 server 한 곳(`/mcp` 선례) |
| **III. UI / 로직 분리** | ✅ | 약속 화면은 `features/promise/*`(렌더) + `hooks/apis/promise/*` · `hooks/pages/promise/*`(상태). 페이지네이션은 `use-conversation-message-list` 를 infinite query 로 바꿔 훅이 갖는다 |
| **IV. const 우선** | ✅ | 직렬 큐는 프라미스 체인 누산기 1곳(`let`, 헌장이 허용하는 "프라미스 직렬화 큐")이다. 근거 주석을 단다. 나머지는 const |
| **V. props 최소** | ✅ | 출처 표시는 `message-bubble` 에 `origin` 슬롯 하나만. 약속 항목 컴포넌트는 훅에서 직접 가져온다 |
| 보안 | ✅ | tick 전용 토큰(다른 토큰과 같으면 부팅 거부, 미설정이면 404). 외부 MCP 에 약속 도구 없음. 약속 턴은 평소 권한 그대로(내장 파일 · 셸 도구 없음, WebFetch 가드 동일) |
| 성능 | ✅ | tick 은 모델 호출 0. 매 턴 고정 비용 추가 없음(약속 도구는 in-process, 호출될 때만 DB). 목록 · 메시지가 jsonb 를 통째로 읽거나 쓰지 않음(R7) |
| 워크플로 | ✅ | 스키마 변경은 `db:generate` → `db:migrate` 2단계 + 0012 는 확인 뒤 별도 단계 |

**Post-design re-check (Phase 1 후)**: 위 판정이 유지된다. 원칙 I 은 개정 커밋이 선행 조건으로 tasks 첫 항목이 된다.

## Project Structure

### Documentation (this feature)

```text
specs/003-proactive-promises/
├── plan.md              # 이 문서
├── research.md          # R1–R12 결정
├── data-model.md        # promises · promise_runs · messages · conversations 변경
├── quickstart.md        # 준비 · 운영 순서 · S0–S17
├── contracts/
│   ├── http.md          # 약속 · tick · 대화방 페이지네이션
│   └── promise-tools.md # promise / promise_run 도구 · 시스템 프롬프트 절
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 가 만든다
```

### Source Code (repository root)

```text
.specify/memory/constitution.md          # v2.1.0 개정 (첫 커밋)

packages/validation/src/
├── conversation.ts      # messageSchema.origin, isMain, hasMore, messagePageSchema, messageCount 제거
└── promise.ts           # 신규: promise · run · 도구 입력 스키마

packages/db/src/schema.ts                # promises, promise_runs, messages, conversations(is_main, session_turns)
packages/db/migrations/
├── 0011_*.sql           # 표 생성 + jsonb → messages 백필
└── 0012_*.sql           # conversations.messages 제거 (S0 확인 뒤)

packages/domain/src/
├── conversation/index.ts  # messages 표 기반으로 재작성, ensureMain, page, 메인 방 삭제 거부, 세션 교체 판정
├── promise/
│   ├── schedule.ts        # 순수: 검증 · 다음 회차 · 사람이 읽는 일정 (cron-parser, Asia/Seoul)
│   ├── index.ts           # CRUD · 상한 · 선점(claim) · 완료(complete) · 임대 만료 정리
│   ├── run.ts             # 약속 턴 실행: 프롬프트 조립 → chat.runPromiseTurn → 결과 기록
│   └── mcp.ts             # promise / promise_run in-process MCP 서버
├── chat/index.ts          # runTurn 공통부 분리, 대화 턴에 promise 서버, 약속 턴 갈래, 시스템 프롬프트 절
├── chat/history.ts        # withHistory 조건 완화(R8)
└── errors.ts              # MainRoomUndeletableError, PromiseLimitError, ScheduleInvalidError

apps/server/src/
├── env.ts               # NAVIS_TICK_TOKEN (선택, 다른 토큰과 다를 것)
├── app.ts               # 기본 잠금에 /internal/tick 갈래, 라우트 등록
├── turns.ts             # 신규: 진행 중 대화 턴 레지스트리 (chat.ts 의 activeConversations 이전)
├── promise-runner.ts    # 신규: 직렬 큐 + 같은 회원 대화 양보
└── routes/
    ├── chat.ts          # turns 레지스트리 사용, 최근 20개 history, 세션 교체
    ├── conversations.ts # 메시지 페이지 라우트, 409
    ├── promises.ts      # 신규: GET / PATCH / DELETE
    └── internal.ts      # 신규: POST /internal/tick

packages/api/src/client.ts               # promises · 메시지 페이지 메서드

apps/web/src/
├── app/api/promises/route.ts, [id]/route.ts       # BFF
├── app/api/internal/tick/route.ts                  # 중계 (mcp 와 같은 방식)
├── app/api/conversations/[id]/messages/route.ts    # 페이지 BFF
├── app/promises/page.tsx
├── features/promise/*                               # 약속 목록 · 항목 · 실행 기록
├── features/chat/message-bubble.tsx                 # origin 표시
├── features/chat/message-list.tsx                   # 위로 스크롤 시 더 불러오기
├── hooks/apis/promise/*                             # 목록 · 켜고 끄기 · 지우기
├── hooks/apis/conversation/use-conversation-message-list.ts  # infinite query
├── hooks/pages/conversation/use-conversation-workspace.ts    # 기본 방 = 메인 방
└── components/layout/sidebar.tsx                    # 메인 방 고정 · 삭제 버튼 숨김 · 약속 링크

deploy/
├── service.yaml         # server 에 navis-tick-token 주입
└── README.md            # Scheduler 작업 생성 명령 · 운영 순서
```

**Structure Decision**: 기존 모노레포 구조를 그대로 따른다.
- 새 패키지는 만들지 않는다. 약속은 `packages/domain/src/promise` 한 폴더다.
- 프로세스 로컬 실행 상태는 `apps/server` 에 둔다. 진행 중 턴 `AbortController` 가 거기 있는 것과 같은 이유다.

## Implementation Phases (tasks 의 큰 순서)

1. **헌장 개정** v2.1.0 (R12): 다른 모든 것의 선행 조건
2. **메시지 표 이전** (R7): 스키마 · 0011 백필 · conversation 도메인 재작성 · 페이지 API · web infinite query.
   약속과 독립적으로 배포 · 검증할 수 있다(S0, S8 일부). 0012 는 확인 뒤.
3. **메인 방 + 세션 교체** (R8, R9): US5
4. **약속 도메인 + 대화 도구** (R6, `promise` MCP): 약속을 만들고 볼 수 있다. 아직 실행되지 않는다.
5. **실행** (R2–R5, R10, R11): turns 레지스트리 · 직렬 큐 · tick 라우트 · `promise_run` 도구 · 푸시 → US1 · US2
6. **약속 화면** (US4) + 제안 지침(US3)
7. **운영**: 비밀값 · Scheduler 작업 · quickstart S1–S17 · 메모리 실측

## Complexity Tracking

| 추가하는 것 | 왜 필요한가 | 더 단순한 대안을 버린 이유 |
|---|---|---|
| `messages` 표로 이전(R7) | jsonb 통짜는 추가마다 방 전체를 다시 쓰고, 목록이 방마다 배열 전체를 읽는다. 끝없는 메인 방에서 SC-004 를 못 지킨다 | 기기 로컬 저장은 서버가 만드는 메시지 · 턴 맥락 · PWA 저장소 소실 · 동기화 때문에 기각(2026-10-14 사용자 합의). 메인 방 기간 분할은 목록 비용이 그대로다 |
| `cron-parser` 의존 | 반복 일정의 표현력(하드코딩 금지 원칙)과 KST 해석 | 구조화 반복(daily/weekly)은 "매월 마지막 금요일"을 못 받는다. cron 해석을 직접 짜면 시간대 · 경계 버그를 떠안는다 |
| 프로세스 로컬 직렬 큐 + 턴 레지스트리 | 메모리 1Gi 보호와 대화 우선(SC-003) | DB 기반 큐는 인스턴스가 하나라 얻는 것이 없다. 병렬은 메모리 위험 |
| Cloud Scheduler(새 GCP 서비스) | minScale 0 에서 약속을 깨울 유일한 저비용 수단 | 프로세스 내 cron 은 죽는다. minScale 1 은 상시 과금. Cloud Tasks 는 정확하지만 약속 수정마다 재예약이 필요하다 |
