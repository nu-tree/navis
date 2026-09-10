# Implementation Plan: 핵심 나비스 — 기억과 대화

**Branch**: `001-core-memory-chat` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-core-memory-chat/spec.md`

## Summary

기억 저장 · 기억 불러오기 · 대화. 이 셋만 있는 웹 나비스를 완성한다. 저장소는 이미 **동작하는
골격**이고(`STRUCTURE.md`) 비즈니스 로직이 비어 있다 — 이 계획은 그 빈 곳을 채운다.

기술 접근은 네 줄로 요약된다.

1. **기억은 프로세스 안의 MCP 도구로 붙인다.** `createSdkMcpServer` + `mcpServers`. 내장
   도구는 `tools: []` 로 계속 전면 차단한다 — 조사 결과 그 배열은 **내장 도구만** 가리키므로
   MCP 도구와 충돌하지 않는다(research R3).
2. **불러오기는 모델 판단에 맡긴다.** 매 턴 자동 검색을 하지 않아 인사에는 임베딩 왕복이
   붙지 않는다. 첫 토큰 3초 예산을 지키는 핵심 결정이다(Q5).
3. **사용자 메시지는 보내는 즉시 커밋한다.** 스트림을 열기 전에 방 생성 + 질문 기록을 끝내
   서버가 언제 죽어도 사용자가 쓴 글이 남는다(Q3).
4. **로그인은 3층으로 나눈다.** 브라우저는 로그인만, `proxy.ts` 는 낙관적 리다이렉트만,
   실제 인가는 BFF 라우트 핸들러가 한다. Next 16 문서가 프록시를 인가 수단으로 쓰지 말라고
   명시한다(research R2).

## Technical Context

**Language/Version**: TypeScript 5.9 · Node ≥ 22 · 전부 ESM (`"type": "module"`)

**Primary Dependencies**
- 웹: Next 16.3.4 · React 19.2.8 · Tailwind v4(`@theme`) · radix-ui/shadcn · react-markdown
- 서버: Hono 4.13 · `@hono/node-server` 2.1 (상주 프로세스)
- 공용: zod 4.5 · drizzle-orm 0.45 · postgres 3.4
- 두뇌: `@anthropic-ai/claude-agent-sdk` 0.3.263
- **새로 들이는 것**: `@supabase/ssr` (인증 · 미설치) · Vitest (테스트 · 미설치) ·
  Voyage AI 임베딩 (HTTP 직접, 공식 TS SDK 없음)

**Storage**: Supabase Postgres + pgvector. 기억 벡터는 1024차원, HNSW + `vector_cosine_ops`.
기존 스키마로 거의 다 커버되고 변경은 `memories.source` 제거 하나뿐이다(선택).

**Testing**: Vitest — `packages/domain` 단위(순수 함수) + `apps/server` 계약(`app.fetch()` 직접
호출). 웹 단위 테스트와 E2E 는 하지 않는다. 확률적 기준은 `quickstart.md` 의 수동 시나리오가
덮는다. 근거와 기각한 대안은 research R1.

**Target Platform**: 모던 브라우저 + Node 22 상주 서버. 배포 대상 미정(Railway 제외).

**Project Type**: 웹 — pnpm 모노레포(Next 웹 + Hono 상주 서버 + 공용 패키지 5개)

**Performance Goals**

| 목표 | 근거 |
| --- | --- |
| 첫 토큰 3초 (짧은 질문) | SC-001 |
| 중지 2초 안에 실제 정지 | SC-002 |
| 기억 목록 1초 / 1,000건 | SC-007 |
| 방 목록 1초 / 200방×500메시지 | SC-009 |
| 내보내기 10초 / 1,000건 | SC-016 |
| 인사 10턴에서 기억 검색 0회 | SC-017 |

**Constraints**
- 브라우저에 `API_TOKEN` 미노출 (SC-011 검증 방법까지 스펙에 명시)
- 내장 파일 · 셸 도구 전면 차단. 열리는 도구는 `mcp__memory__*` 뿐
- 매 턴 뒤 추가 모델 호출(사후 큐레이터) 금지
- 제품 표면은 대화 · 기억 · 설정 **세 화면** (SC-010). 로그인은 문이라 별도
- 사용자가 보낸 메시지 유실 0건 (SC-015)

**Scale/Scope**: 단일 사용자 · 단일 계정. 기억 10^3~10^4, 방 200+, 화면 3 + 로그인 1.
기능 요구 53개 · 성공 기준 18개 · 사용자 이야기 6개.

## Constitution Check

*GATE: Phase 0 전에 통과해야 한다. Phase 1 설계 후 재확인.*

헌장 v1.0.0 (`.specify/memory/constitution.md`) 기준.

### 핵심 원칙

| 게이트 | 판정 | 근거 |
| --- | --- | --- |
| **I. 핵심만 남긴다** | ✅ PASS | 기억 그래프 · 외부 도구 개방 모두 범위 밖으로 확정(Q2·Q3). 신설 요구 FR-047(겹치는 기억 정리) · FR-050(내보내기)은 **기억 화면 안**이라 세 화면을 넘지 않는다. 방 생성 전용 라우트를 만들지 않고 첫 메시지가 겸한다 |
| **II. 의존은 아래로만** | ✅ PASS | `@supabase/ssr` 은 `apps/web` **에만** 들어간다 — `packages/validation` 은 zod 하나를 유지한다. `apps/server` 는 사용자 신원을 모르므로 인증이 `domain` 으로 새지 않는다. 인증 상태는 계층을 타고 내려가지 않는다 |
| **III. UI / 로직 분리** | ✅ PASS | 상태 · 네트워크는 `features/<도메인>/use-*.ts`. 기억 화면의 이웃 조회 · 정렬도 훅이 갖는다. `components/ui/*` 는 도메인 타입을 계속 import 하지 않는다 |
| **IV. const 우선** | ✅ PASS | 새 `let` 을 늘리지 않는다. R6 의 재정렬은 순수 함수로 쓴다(`map`/`sort`) |
| **V. props 최소 · 합성** | ✅ PASS | 기억 화면의 항목 → 이웃 펼침은 `children` 합성으로 둔다. 목록이 이웃 상태를 props 로 흘리지 않는다 |

### 보안 · 성능 · 규약

| 게이트 | 판정 | 근거 |
| --- | --- | --- |
| 브라우저에 서버 토큰 미노출 | ✅ PASS | BFF 유지. `NEXT_PUBLIC_` 금지. S12 로 검증 |
| 서버 기본 잠금 | ✅ PASS | `app.use("*")` 유지, 새 라우트가 자동으로 보호된다 |
| 내장 도구 차단 | ✅ PASS | **research R3 로 확인** — `Options.tools` 는 내장 도구 집합이고 `[]` 가 전면 차단이다. MCP 도구는 `mcpServers` 로 따로 온다 |
| `settingSources: []` | ✅ PASS | 변경 없음 |
| 환경변수 부팅 검증 | ✅ PASS | `env.ts` 에 `VOYAGE_API_KEY` 추가 |
| 첫 토큰 지연 예산 | ✅ PASS | in-process MCP + 모델 판단 검색(Q5). SC-017 로 측정 |
| 사후 큐레이터 금지 | ✅ PASS | 저장 판단은 턴 안에서 끝난다 |
| 목록은 필요한 열만 | ✅ PASS | `ConversationSummary` 사용 |
| 타입 있는 오류 | ✅ PASS | 404 를 메시지 문자열로 판정하지 않는다 |
| id 는 `randomUUID()` | ✅ PASS | |
| 계약은 `@navis/validation` 단일 출처 | ✅ PASS | 새 스키마(`MemoryExport`)도 여기 둔다 |

### ⚠️ 개정 대기 — 게이트 2건

둘 다 **원칙 위반이 아니라 문서 지연**이다. 사용자가 로그인과 테스트 게이트를 명시적으로
정한 뒤 헌장이 아직 갱신되지 않았다. 헌장 Governance 가 스택 변경과 게이트 추가를 개정
사항으로 규정하므로 여기 기록한다. 상세는 Complexity Tracking.

**개정 없이 구현을 시작해도 설계는 흔들리지 않는다** — 두 결정 모두 헌장의 기존 방향(BFF 유지,
브라우저에 서버 토큰 미노출)과 같은 쪽이다. 다만 개정하지 않으면 다음 사람이 헌장의 보안 절을
"브라우저에 아무 토큰도 없어야 한다"로 읽고 로그인 세션과 충돌한다.

### Phase 1 설계 후 재확인

**결과: 통과.** 설계가 게이트를 새로 깨뜨리지 않았다. 확인한 것:

- `contracts/server-http.md` 의 새 엔드포인트 10개가 전부 기본 잠금 아래 들어간다.
- 인증이 `packages/*` 어디에도 나타나지 않는다 — `apps/web` 안에서 끝난다(원칙 II).
- `data-model.md` 에 사용자 식별자 열이 없다 — 로그인이 데이터 모델을 오염시키지 않았다.
- 새 화면이 0개다. FR-047 · FR-050 은 기억 화면 안에 들어간다(SC-010 유지).
- `memories.source` · `skipIfDuplicate` · `saveResultSchema` 중복 갈래 · `graphifyInputSchema` ·
  `/mcp` 주석이 **소비자를 잃었다** — 원칙 I 에 따라 정리 대상이다(체크리스트 Notes 에 기록).

## Project Structure

### Documentation (this feature)

```text
specs/001-core-memory-chat/
├── plan.md              # 이 파일
├── spec.md              # 기능 명세 (FR 53 · SC 18 · 사용자 이야기 6)
├── research.md          # Phase 0 — 결정 10건
├── data-model.md        # Phase 1 — 엔티티 · 저장↔와이어 매핑 · 생애
├── quickstart.md        # Phase 1 — 검증 시나리오 15개
├── contracts/           # Phase 1
│   ├── server-http.md   #   apps/server 엔드포인트 + BFF
│   ├── chat-stream.md   #   SSE 이벤트 유니온
│   └── memory-mcp.md    #   프로세스 내 기억 도구
├── checklists/
│   └── requirements.md  # 스펙 품질 16/16 + 정리 대상 목록
└── tasks.md             # Phase 2 (/speckit-tasks — 이 커맨드가 만들지 않는다)
```

### Source Code (repository root)

`+` 신규 · `~` 수정 · `-` 삭제

```text
apps/
├── server/src/
│   ├── env.ts                   ~ VOYAGE_API_KEY 부팅 검증 추가
│   ├── app.ts                   ~ 라우트 등록. /mcp 예고 주석 삭제
│   └── routes/
│       ├── chat.ts              ~ 메시지 기록 시점(R9) · sessionId 를 DB 로(R10) · 동시 턴 409
│       ├── conversations.ts     + 목록 · 조회 · 삭제 · 메시지 삭제
│       ├── memories.ts          + 목록 · 추가 · 검색 · 이웃 · 수정 · 삭제 · 할일 · 내보내기
│       ├── settings.ts          + 성격 조회 · 저장
│       └── health.ts              변경 없음
└── web/src/
    ├── proxy.ts                 + 낙관적 리다이렉트만 (Next 16: middleware → proxy)
    ├── app/
    │   ├── login/page.tsx       + 로그인 화면
    │   ├── memories/page.tsx    + 기억 화면
    │   ├── settings/page.tsx    + 설정 화면
    │   └── api/                 ~ chat 유지 + conversations · memories · settings BFF 추가
    ├── features/
    │   ├── chat/                ~ use-chat.ts 에 방 목록 · 이어가기 반영
    │   ├── conversation/        + 방 목록 훅 · 사이드바 배선
    │   ├── memory/              + 목록 · 검색 · 수정 · 이웃 정리 · 내보내기 훅과 화면
    │   ├── settings/            + 성격 편집
    │   └── auth/                + 로그인 · 로그아웃 훅
    ├── components/layout/
    │   └── sidebar.tsx          ~ PLACEHOLDER_ROOMS 제거 · unread 배지 제거(계약에 없다)
    └── lib/
        ├── api-server.ts          변경 없음
        └── session.ts           + 세션 검증 (BFF 라우트가 쓴다)

packages/
├── validation/src/
│   ├── memory.ts                ~ MemoryExport 추가 · graphifyInputSchema 삭제
│   │                              saveResultSchema 단일 갈래로 · source/skipIfDuplicate 삭제
│   ├── chat.ts                  ~ SELECTABLE_MODELS 의 Haiku id 실측 후 확정(R4)
│   └── conversation.ts            변경 없음
├── domain/src/
│   ├── memory/index.ts          + 이관 — save · recall · recent · update · remove · todos
│   │                              embed() 가드(R5) · 시간 가중치 재정렬(R6) · 이웃 조회(R7)
│   │                              내보내기 직렬화(R8)
│   ├── chat/index.ts            ~ 기억 MCP 등록(R3) · 시스템 프롬프트를 DB 설정에서
│   ├── conversation/index.ts    + 이관 — 목록 · 조회 · 메시지 추가 · 삭제
│   └── settings/index.ts        + 이관 — 성격 조회/저장 (DB → env → 기본값)
└── db/src/schema.ts             ~ memories.source 삭제(선택) → db:generate · db:migrate
```

**Structure Decision**: 기존 모노레포 구조를 **그대로 쓴다**. 새 패키지를 만들지 않는다 —
`plan-web.md` 가 그린 `packages/hooks` 도 지금은 만들지 않는다(공유할 훅의 두 번째 소비자가
없다, 원칙 I). 화면은 `apps/web/src/features/<도메인>/` 아래에 도메인별로 모으고, 재사용
프리미티브는 `components/ui/` 에 남겨 원칙 III 의 경계를 유지한다.

## Complexity Tracking

> Constitution Check 의 개정 대기 2건.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 헌장 "스택" 절에 없는 **인증 제공자**를 들인다. 보안 절도 브라우저 세션과 서버 토큰을 구분하지 않는다 | 사용자가 Q1 에서 로그인을 명시적으로 선택했다. 이 주소를 인터넷에 두는 순간 잠금 없이는 주소를 아는 누구나 기억 전부를 읽는다(SC-013) | *로그인 없음(로컬 전용)*: 사용자가 배제했다. *자체 비밀번호*: 해시 · 회전 · 유출 대응 책임이 생기는데, 데이터베이스가 이미 그 제공자 위에 있어 계정 저장소와 인증 API 가 새 인프라 없이 딸려 온다(R2) |
| 헌장 머지 조건(`typecheck` + `lint`)에 **`pnpm test` 게이트**를 추가한다 | SC-005 · SC-015 · SC-016 은 결정적이라 자동 검증이 값어치를 한다. 특히 메시지 기록 시점(R9)은 회귀가 조용히 생기는 종류다 | *테스트 없음(현 상태)*: SC-015 를 서버 재시작 10회로 매번 손으로 확인해야 한다. *E2E 추가*: 상주 서버 + 외부 모델 + 외부 임베딩에 걸려 느리고 불안정하다 — 단일 사용자 도구에 유지비가 과하다(R1) |

두 항목 모두 **MINOR** 개정(원칙 추가가 아니라 기존 절의 실질적 확장)이다.
`/speckit-constitution` 으로 v1.1.0 을 올린 뒤 `/speckit-tasks` 로 가는 것을 권한다.
