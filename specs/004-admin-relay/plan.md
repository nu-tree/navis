# Implementation Plan: 관리자가 나비스를 통해 회원에게 말 걸기 — 전하기

**Branch**: `main` (기능 브랜치 없음 — 디렉터리 `004-admin-relay`) | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-admin-relay/spec.md`

## Summary

관리자가 회원 하나와 지시 한 문장을 주면, 받는 회원의 나비스가 그 회원의 맥락으로 말을 지어 "나비스" 방에 한 마디로 전하고 알림을
보낸다. 받는 쪽에는 출처 표시가 없고, 지시가 밝히라고 할 때만 나비스가 말 속에서 밝힌다. 턴은 **관리자의 Claude 토큰**으로 돈다.

기술 방향: 새 표 `relays` 에 넣기만 하고(화면 `POST /relays` · 관리자 대화 도구 `relay`), 기존 `/internal/tick` 이 약속과 함께
선점해 같은 실행기 큐에서 돌린다. 턴은 `runTurn` 에 `tokenUserId` · `relayRun` 을 더해 받는 회원의 기억 · 기록 + 관리자 토큰으로
돌리고, 전용 도구 `relay_run.deliver` 가 기존 `deliver` 로 전한다. 회원 목록은 같은 DB 의 `auth.users` 를 읽는다.
근거는 [research.md](./research.md) R1–R10.

## Technical Context

**Language/Version**: TypeScript(strict, `noUncheckedIndexedAccess`), Node ≥ 22, ESM

**Primary Dependencies**: Hono(server), Next 16 · React 19 · shadcn/radix(web), drizzle, `@anthropic-ai/claude-agent-sdk`, zod

**Storage**: Postgres(Supabase 운영 / pgvector 로컬). 새 표 `relays`, `messages.meta.relayId`, `auth.users` 읽기 전용

**Testing**: vitest — domain 순수 함수 · 실제 DB 테스트, server `app.fetch()` 계약 테스트

**Target Platform**: Cloud Run 서비스 하나(web ingress + server 사이드카), Cloud Scheduler tick 1분

**Project Type**: pnpm 모노레포 웹 서비스

**Performance Goals**: 보낸 뒤 3분 안 도착 95%(SC-002). 받는 회원 대화의 첫 토큰 지연 변화 없음(SC-005)

**Constraints**: 대화 턴에 고정 비용을 얹지 않는다 — `relay` 도구는 관리자 턴에만 열리고, `member.list()` 는 도구가 불릴 때만 돈다.
약속 · 전하기 턴은 프로세스에서 한 번에 하나

**Scale/Scope**: 관리자 1명, 회원 수십 명 이하. 전하기 기록 관리자당 최근 50개

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 · 절 | 판정 | 내용 |
|---|---|---|
| I. 핵심만 | ⚠️ 개정 필요 | 전하기는 "대화"다 — 나비스가 회원에게 먼저 거는 한 마디(약속과 같은 갈래). 새 종류의 고정 능동 기능이 아니라 지시 문장 + 모델 판단이다. 헌장 I 에 "전하기는 관리자가 다른 회원의 나비스에게 맡기는 대화다" 한 항목을 더한다 |
| II. 의존 방향 | ✅ | validation(`relay.ts`) ← db(`relays`) ← domain(`relay/`, `member/`) ← server(라우트) / web 은 BFF 로만. 실행은 tick 이 집어 domain 이 server 를 부르지 않는다(R2) |
| II. 회원 격리 | ⚠️ 개정 필요 | "모든 행은 한 회원의 것"의 예외: 관리자의 전하기가 받는 회원 방에 메시지 하나를 남긴다(FR-020). 받는 회원의 다른 행을 관리자가 읽지 않는다(R9) |
| II. 도구에 회원 id 없음 | ✅ | `relay` 도구는 `to` 문자열만 받고 목록 안에서 맞춘다(R5) |
| II. 토큰은 그 회원의 것 | ⚠️ 개정 필요 | 전하기 턴만 관리자 토큰(FR-022, R3). `chat/index.ts` 의 FR-111 주석과 헌장에 예외로 적는다 |
| III. UI/로직 분리 | ✅ | `features/relay/use-relays.ts` 훅이 상태 · 폴링, `.tsx` 는 렌더만. 매칭 규칙은 domain |
| IV. const 우선 | ✅ | 새 `let` 없음 계획 |
| V. props 최소 | ✅ | 페이지 → 폼 · 목록 두 컴포넌트, 각자 훅 사용 |
| 보안: in-process MCP 셋뿐 | ⚠️ 개정 필요 | `relay`(관리자 대화) · `relay_run`(전하기 턴) 추가 → 다섯. 외부 MCP 에는 열지 않음 |
| 보안: server 기본 잠금 | ✅ | `/relays*` 는 기본 잠금 안 + `isOwner` 403 |
| 보안: 비밀값 | ✅ | 새 비밀값 없음. `auth.users` 는 기존 `DATABASE_URL` 로(R4) |
| 성능: 매 턴 고정 비용 | ✅ | 회원 턴 변화 없음. 관리자 턴은 MCP 서버 하나 추가(in-process) |
| 성능: 약속 턴 하나씩 · 대화 우선 | ✅ | 같은 큐 · `waitUntilIdle` 재사용 |
| 규약: 타입 있는 에러 | ✅ | 409 는 `kind` 로 판별 |
| 스키마 2단계 | ✅ | `db:generate` → `db:migrate` |

**게이트 결과**: 통과(조건부). ⚠️ 넷은 같은 개정 하나로 묶는다 — 구현 첫 태스크로 헌장 v2.2.0(MINOR: 절 추가) 개정을 먼저 한다.
위반을 숨기지 않고 개정으로 해소하므로 Complexity Tracking 에 정당화를 남긴다.

**Phase 1 후 재검토**: data-model · contracts 가 위 판정을 바꾸지 않는다. 와이어에서 relay 흔적을 빼기로 한 결정(R8)으로 FR-011 이
화면뿐 아니라 응답 수준에서 지켜진다.

## Project Structure

### Documentation (this feature)

```text
specs/004-admin-relay/
├── plan.md              # 이 파일
├── research.md          # R1–R10
├── data-model.md        # relays 표 · 상태 전이 · meta.relayId · auth.users
├── quickstart.md        # 자동 테스트 범위 + 수동 시나리오 M1–M12
├── contracts/
│   ├── http.md          # /relays*, tick 변경
│   └── relay-tools.md   # relay · relay_run.deliver · RELAY_RUN_PROMPT
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 가 만든다
```

### Source Code (repository root)

```text
packages/validation/src/
└── relay.ts                     # 새: 입력 · RelayItem · Member 스키마

packages/db/
├── src/schema.ts                # relays 표 추가
└── migrations/0012_*.sql        # db:generate 산출

packages/domain/src/
├── member/index.ts              # 새: list() (auth.users → 폴백), matchMember() 순수 함수
├── relay/
│   ├── index.ts                 # 새: create · list · claimPending · complete · 보존
│   ├── run.ts                   # 새: executeRelay(run) — runTurn(relayRun) → 결과
│   └── mcp.ts                   # 새: createRelayMcpServer(관리자 대화) · createRelayRunMcpServer(deliver)
├── promise/deliver.ts           # 넓힘: origin 대신 meta 조각({origin}|{relayId})
├── conversation/index.ts        # MessageMeta 에 relayId, 와이어 매핑에서 제외
└── chat/index.ts                # TurnInput: tokenUserId · canRelay · relayRun, MCP · 프롬프트 분기

apps/server/src/
├── app.ts                       # /relays* isOwner 403, 라우트 연결
├── routes/relays.ts             # 새: GET /members, GET /, POST /
├── routes/chat.ts               # runTurn 에 canRelay: isOwner(userId)
├── routes/internal.ts           # tick: 전하기 먼저 선점
└── promise-runner.ts            # enqueue 가 약속 · 전하기 작업을 모두 받음

apps/web/src/
├── app/api/relays/route.ts, app/api/relays/members/route.ts   # BFF 중계
├── app/relay/page.tsx           # 새 페이지
├── hooks/apis/relay/*           # 목록 · 회원 · 보내기 쿼리
├── features/relay/              # use-relays.ts, relay-form.tsx, relay-list.tsx
└── components/layout/top-bar.tsx  # ⋯ 메뉴에 관리자만 "말 걸기"

.specify/memory/constitution.md  # v2.2.0 개정 (FR-020)
```

**Structure Decision**: 기존 모노레포 계층을 그대로 쓴다. 새 패키지 없음. domain 에 `relay/` · `member/` 두 모듈, server 에 라우트 하나, web 에
페이지 하나.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 회원 격리 예외(관리자 → 남의 방에 메시지) | 기능의 본질 — 관리자가 다른 회원에게 말을 건다 | 대안 없음. 범위를 메시지 한 개 쓰기로 좁히고 읽기는 열지 않는다 |
| 남의 토큰으로 턴 실행(관리자 토큰 · 받는 회원 맥락) | 사용자 결정 FR-022 — 관리자가 시킨 일의 비용은 관리자 몫 | 받는 회원 토큰(A안): 사용자가 윤리적으로 기각 |
| in-process MCP 3 → 5 | 관리자 대화 입구(`relay`)와 조용함 없는 전달(`relay_run`) | `promise_run.notify` 재사용: origin · 조용함 · memo/finish 규칙이 따라와 약속 쪽 규칙이 흐려진다(R7) |
| 새 표 `relays` | 지시 원문 비노출 · 토큰 주인 · 조용함 없음 | 약속 행 재사용: 받는 회원 약속 화면에 지시 원문이 보이고 `kind` 금지를 깬다(R1) |
