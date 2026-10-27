# Implementation Plan: 주제 대화 — 주제마다 방을 나누고, 그 방이 어떤 기억을 바탕으로 하는지 보이게

**Branch**: `main` (기능 브랜치 없음 — 디렉터리 `005-topic-rooms`) | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-topic-rooms/spec.md`

> **⏸ 보류 (2026-10-23 사용자 결정)** — 구현하지 않는다. 이유:
> 1. 초점이 기억의 프로젝트 이름에 기대는데, 프로젝트는 대화 중 모델이 붙여 온 것이라 표기가 흩어져 있다(운영: 한 회원 39개).
>    표기가 다른 주제의 기억이 조용히 빠져 "왜 기억 못 해?"로 보이고, 화면에선 이유가 드러나지 않는다.
> 2. 다른 회원은 주제가 2–3개뿐이라 주제 방이 대부분 '기억 없음'으로 시작한다 — 고르는 단계만 늘어난다.
> 3. 방이 생기면 "어디서 말하지?"가 생기고, "말하면 기억한다"는 단순함이 줄어든다.
>
> 대신: (1) 답마다 '참고한 기억' 표시 — 어떤 기억을 바탕으로 했는지를 방이 아니라 답 단위로 보인다. (2) 정말 필요해지면 기억을
> 좁히지 않는 그냥 새 대화방. 다시 꺼낼 때는 주제 표기 정리 + 방 위의 범위 표시를 조건으로 한다.

## Summary

주제(= 기억의 프로젝트) 하나에 묶인 대화방을 만든다. 주제 방에서 나비스는 그 주제 + 개인 기억으로 기본을 좁혀 찾고, 새 기억은
그 주제로 남기며, 사용자가 넓히라고 하면 그 질문만 전체에서 찾는다. 방 위쪽 칩이 바탕 기억(주제 · 개수)을 보여 주고, 위쪽 바의
방 메뉴로 "나비스" 방과 주제 방을 오간다.

기술 방향: `conversations.project` 열 하나(R1). 초점은 프롬프트가 아니라 기억 MCP 서버의 `focus` 컨텍스트가 기본값으로
건다 — 모델은 예외(`everywhere` · `personal` · 다른 `project`)만 말한다(R3 · R4). 방 만들기는 `POST /conversations`(R5),
목록 요약에 `project` · `memoryCount`(R6), rename 이 방도 옮긴다(R7). 채팅 턴은 이미 읽는 방 행에서 focus 를 꺼내 추가 조회가
없다(R8). 근거는 [research.md](./research.md) R1–R10.

## Technical Context

**Language/Version**: TypeScript(strict, `noUncheckedIndexedAccess`), Node ≥ 22, ESM

**Primary Dependencies**: Hono(server), Next 16 · React 19 · shadcn/radix · zustand · TanStack Query(web), drizzle,
`@anthropic-ai/claude-agent-sdk`, zod

**Storage**: Postgres. `conversations.project` 열 + 비유일 인덱스(마이그레이션 0016). `memories` 는 그대로

**Testing**: vitest — domain 순수 함수(focus 적용 · 턴 도구 조립), server `app.fetch()` 계약(`/conversations`)

**Target Platform**: Cloud Run 서비스 하나(web ingress + server 사이드카)

**Project Type**: pnpm 모노레포 웹 서비스

**Performance Goals**: "나비스" 방 첫 토큰 지연 변화 없음(SC-006). 주제 방도 대화 턴에 조회 · 왕복 추가 없음

**Constraints**: 대화 턴 경로에 고정 비용을 얹지 않는다 — focus 는 `ensure()` 가 이미 읽는 행에서. 방 목록의 기억 개수는 목록
조회에서만(그룹 쿼리 하나). 사이드바를 되살리지 않는다

**Scale/Scope**: 회원 수 명–수십 명, 회원당 주제 방 수십 개 이하

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 · 절 | 판정 | 내용 |
|---|---|---|
| I. 핵심만 | ✅ | "대화"를 주제로 나누고, "기억 불러오기 · 저장"의 범위를 방에 맞춘다. 새 능력 · 종류별 기능 없음. 방 만들기 라우트는 소비자(방 메뉴)가 있다 |
| II. 의존 방향 | ✅ | validation(conversation · memory 필드) ← db(열) ← domain(conversation · memory focus) ← server(라우트) / web 은 BFF 로만 |
| II. 회원 격리 | ✅ | 방 · 기억 모두 `userId` 로 좁힌다. focus 는 범위를 좁히기만 하고 주인을 바꾸지 않는다(FR-010) |
| II. 도구에 회원 id 없음 | ✅ | focus 는 서버 컨텍스트. 도구 입력에는 `everywhere` · `personal` 불리언만 |
| III. UI/로직 분리 | ✅ | 열린 방 · 방 메뉴 · 새 주제 · 칩은 훅(`use-topic-rooms` 등)이 상태 · 네트워크, `.tsx` 는 렌더만. 범위 규칙은 domain |
| IV. const 우선 | ✅ | 새 `let` 없음 계획 |
| V. props 최소 | ✅ | 방 메뉴 · 칩은 각자 훅을 쓴다. 채팅 패널에 칩을 슬롯(children)으로 |
| 보안: in-process MCP 목록 | ⚠️ 개정 밀림 | 이 기능은 서버를 더하지 않는다. 다만 피드백(`feedback`, b815051)이 여섯째로 들어왔는데 헌장은 "다섯뿐" — v2.4.0 개정을 첫 태스크로(R10) |
| 보안: server 기본 잠금 | ✅ | `POST /conversations` 는 기본 잠금 안, 회원으로 좁힘 |
| 성능: 매 턴 고정 비용 | ✅ | 추가 조회 없음(R8). 시스템 프롬프트 절은 방마다 고정 — 같은 방 안에서 캐시 유지 |
| 성능: 목록 쿼리 필요한 열만 | ✅ | 요약에 `project` 열 · 개수만. 메시지 안 실음 |
| 규약: 타입 있는 에러 · 계약은 validation | ✅ | 400/404/409 는 기존 판별 그대로. 새 필드는 validation 스키마에 |
| 규약: 기능 안내 | ✅ | 안내서에 주제 대화 항목 · 화면 지도(위쪽 바) 갱신(FR-022) |
| 스키마 2단계 | ✅ | `db:generate` → `db:migrate`(운영은 배포 전에) |

**게이트 결과**: 통과. ⚠️ 하나는 이 기능과 무관한 밀린 개정이라 첫 태스크로 정리한다.

**Phase 1 후 재검토**: 설계 산출물(data-model · contracts)이 위 판정을 바꾸지 않는다 — 새 비밀값 · MCP 서버 · 실행 경로 없음,
도구 입력에 회원 id 없음, 턴 경로 조회 없음. 통과 유지.

## Project Structure

### Documentation (this feature)

```text
specs/005-topic-rooms/
├── plan.md              # 이 파일
├── research.md          # R1–R10
├── data-model.md        # conversations.project · 와이어 필드
├── quickstart.md        # 자동 검사 + 수동 시나리오 15개
├── contracts/
│   ├── http.md          # /conversations 변경 · POST 새로
│   └── memory-tools.md  # focus 규칙 · "이 방의 주제" 절
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 가 만든다
```

### Source Code (repository root)

```text
packages/
├── validation/src/
│   ├── conversation.ts        # Summary · Conversation 에 project · memoryCount, topicRoomCreateInputSchema
│   └── memory.ts              # everywhere(recall · recent · todos) · personal(save)
├── db/
│   ├── src/schema.ts          # conversations.project + 인덱스
│   └── migrations/0016_*.sql
└── domain/src/
    ├── conversation/index.ts  # openTopicRoom · list(project · memoryCount · 예전 방 숨김) · ensure 가 project 반환
    ├── memory/focus.ts        # 새 — 입력 + focus → 실제 범위(순수 함수)
    ├── memory/mcp.ts          # focus 컨텍스트, 도구 설명에 예외 필드, 응답 첫 줄 범위
    ├── memory/projects.ts     # renameProject 가 방 project · title 도 옮김
    ├── chat/index.ts          # TurnInput.focus → 기억 서버 · "이 방의 주제" 절
    └── guide/index.ts         # 주제 대화 항목 · 화면 지도

apps/server/src/routes/
├── conversations.ts           # POST / (주제 방 열기)
└── chat.ts                    # ensure 의 project → runTurn({ focus })

apps/web/src/
├── store/open-room-store.ts                  # 열린 방(메모리, 저장 안 함)
├── app/api/conversations/route.ts            # POST 추가
├── hooks/apis/conversation/use-open-topic-room.ts
├── hooks/apis/conversation/use-delete-conversation.ts   # 되살림(97fba81 에서 지운 것)
├── hooks/pages/conversation/use-conversation-workspace.ts  # 열린 방 = 스토어 ?? 나비스
├── features/rooms/room-menu.tsx              # 위쪽 바 왼쪽 — 지금 방 ▾, 나비스 고정 · 주제 방 · 새 주제
├── features/rooms/new-topic-dialog.tsx       # 기존 주제 고르기 · 새 이름 · 표기 같은 주제 묻기
├── features/rooms/topic-chip.tsx             # 📁 주제 · 기억 N개 → 시트(기억 목록 · 이 방 지우기)
└── components/layout/{top-bar,workspace}.tsx # 방 메뉴 자리 · usePushBridge(open)
```

**Structure Decision**: 기존 모노레포 구조 그대로. 새 패키지 · 새 표 없음. web 의 방 관련 화면은 `features/rooms/` 하나로 모은다.

## Complexity Tracking

위반 없음.
