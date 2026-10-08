# Implementation Plan: 여러 사람이 쓰는 나비스 — 회원마다 기억 분리

**Branch**: `002-multi-user` (git 브랜치는 만들지 않았다 — 작업은 `main`) | **Date**: 2026-10-08 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-multi-user/spec.md`

## Summary

기억 · 대화 · 설정의 모든 행에 주인(`user_id`)을 두고, 모든 조회 · 수정을 그 회원으로 좁힌다.
접근은 네 줄이다.

1. **신원은 BFF 가 정하고 헤더로 넘긴다.** BFF 가 세션을 확인한 뒤 `x-navis-user` 를 서버 토큰과 함께
   보낸다. server 는 서버 토큰이 맞을 때만 그 헤더를 믿고, 없으면 401 — 관리자로 떨어뜨리지 않는다
   (research R1).
2. **domain 함수는 회원 id 를 인자로 받는다.** 인자 없이는 부를 수 없으니 조건 누락을 타입이 잡는다.
   기억 MCP 는 회원을 클로저로 묶어, 모델이 보는 도구 스키마에는 회원 id 가 없다(R3).
3. **외부 MCP 와 기존 데이터의 주인은 `NAVIS_OWNER_ID`.** 배포 설정 하나로 정한다(R2). 전환은
   `0008`(열 추가) → `assign-owner`(채우기) → `0009`(NOT NULL) 세 단계(R4).
4. **남의 것은 "없음".** 403 을 쓰지 않는다 — 존재 사실이 샌다. 방 id 충돌 · 남의 turnId 중지도 같은
   규칙(R7, R8).

헌장 원칙 II 는 이 기능을 위해 **v2.0.0 으로 개정했다**(아래 Constitution Check).

## Technical Context

**Language/Version**: TypeScript 5.9 · Node ≥ 22 · ESM (001 그대로)

**Primary Dependencies**: 001 그대로 — 새 의존 **없음**. Hono 컨텍스트 변수 · drizzle · postgres ·
`@supabase/ssr`(web 만) · Agent SDK.

**Storage**: Postgres(Supabase) + pgvector ≥ 0.8(`hnsw.iterative_scan`, R5). 마이그레이션 2개
(`0008`, `0009`) + 채우기 스크립트 1개.

**Testing**: Vitest. domain 은 **로컬 Postgres 실DB** 로 두 회원을 만들어 분리를 검증한다(001 의
`manage.test.ts` 방식). server 는 라우트 계약 테스트(헤더 판정 · 남의 id 404).

**Target Platform**: Cloud Run 서비스 하나(web ingress + server 사이드카), 인스턴스 최대 1 — 그대로.

**Project Type**: 웹 서비스 모노레포(`apps/web` · `apps/server` · `packages/*`).

**Performance Goals**: SC-105 — 목록 · 검색 · 방 목록이 전환 전 대비 2배 이내. 회원 조건이 붙는
질의는 `(user_id, created_at)` · `(user_id, updated_at)` 복합 인덱스를 탄다.

**Constraints**: 브라우저가 보낸 값은 신원이 아니다(FR-107). 도구 스키마에 회원 id 를 넣지 않는다.
전환 중 주인 없는 행 0건(FR-101, FR-115).

**Scale/Scope**: 회원 수 명~수십 명, 회원당 기억 수천 건.

## Constitution Check

*GATE: Phase 0 전 · Phase 1 후 두 번 본다.*

| 원칙 | 판정 | 근거 |
| --- | --- | --- |
| I. 핵심만 남긴다 | ✅ | 새 화면 · 새 기능 없음. 기억 · 대화 · 설정을 회원별로 나눌 뿐이다. 관리 화면 · 공유 · 탈퇴 삭제는 범위 밖(spec Assumptions) |
| II. 의존은 아래로만 | ✅ (**v2.0.0 개정 후**) | 개정 전 원문 "기억 · 대화 · 설정에 사용자 식별자 열을 두지 않는다 — 다중 사용자로 가려면 이 항목을 먼저 개정한다"와 정면 충돌 → **MAJOR 개정**(2026-10-08). 개정 후: 인증은 web, server 는 "어느 회원인가"만, domain 은 회원 id 를 인자로, 도구 스키마엔 없음. 계층 방향 · 패키지 의존은 그대로 |
| III~V (책임 분리 · 합성 · 시그니처) | ✅ | 시그니처 변경은 `userId` 를 **첫 인자**로 더하는 한 가지 패턴. 입력 객체 모양(스키마)은 바뀌지 않는다 |
| 보안 절 | ✅ | 기본 잠금 유지 — 회원 판정도 `app.use("*")` 한 곳. `/mcp` 는 헤더를 보지 않고 관리자 고정 |
| 성능 절 | ✅ | 회원 조건은 인덱스로. 벡터 검색은 `iterative_scan` 으로 결과 모자람을 막는다(R5). 턴 경로에 왕복 추가 없음 |
| 배포 절 | ✅ | 인스턴스 1 · 서비스 하나 그대로. 비밀값 `navis-owner-id` 하나 추가(server 에만). 마이그레이션은 수동 단계 |

**Post-design 재확인(Phase 1 후)**: data-model · contracts 가 위 판정을 바꾸지 않는다. 남은 위반 없음 —
Complexity Tracking 비어 있음.

## Project Structure

### Documentation (this feature)

```text
specs/002-multi-user/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # R1~R9
├── data-model.md        # user_id · 인덱스 · 전환
├── quickstart.md        # S0~S6
├── contracts/
│   ├── identity.md      # x-navis-user · 판정 · 남의 데이터 응답
│   └── memory-mcp.md    # createMemoryMcpServer({ userId })
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 가 만든다
```

### Source Code (바뀌는 곳)

```text
packages/db/
├── src/schema.ts                  # user_id 3곳, settings PK, 복합 인덱스
├── migrations/0008_*.sql · 0009_*.sql
└── src/assign-owner.ts            # 채우기 스크립트(+ package.json script)

packages/domain/src/
├── memory/*.ts                    # save · recall · recent · todos · update · remove · neighbors ·
│                                  #   export · projects · scope — userId 첫 인자
├── memory/mcp.ts                  # createMemoryMcpServer({ userId, tally })
├── conversation/index.ts          # list · get · ensure · append · remove … userId 첫 인자, 남의 방 404
├── settings/index.ts              # claudeToken.*(userId), 캐시 Map
└── chat/index.ts                  # runTurn({ userId, … })

apps/server/src/
├── env.ts                         # NAVIS_OWNER_ID 부팅 필수
├── app.ts                         # x-navis-user 판정 → c.set("userId"), /mcp 는 owner
└── routes/*.ts                    # c.get("userId") 를 domain 에 전달, cancel 은 같은 회원만

apps/web/src/lib/
├── session.ts                     # (그대로) authenticated → userId
└── bff.ts                         # x-navis-user 를 붙인다 (unconfigured → "owner")

deploy/service.yaml · deploy/README.md   # navis-owner-id, 전환 순서
```

**Structure Decision**: 001 의 모노레포 구조 그대로. 새 패키지 · 새 앱 없음. 화면(`apps/web` 의
features · hooks)은 바뀌지 않는다 — 회원 분리는 BFF 아래에서 끝난다.

## Complexity Tracking

> 위반 없음.
