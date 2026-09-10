# Specification Quality Checklist: 핵심 나비스 — 기억과 대화

**Purpose**: 계획 단계로 넘어가기 전 스펙의 완결성과 품질을 검증한다
**Created**: 2026-09-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### 2차 검증 (2026-09-10) — 16/16 통과

미결 3건이 사용자 응답으로 해소되었다.

| 질문 | 답 | 스펙 반영 |
| --- | --- | --- |
| Q1 웹 접근 통제 | **로그인 도입** (기존 Supabase 프로젝트의 인증 기능 사용) | FR-043~046 신설, 사용자 이야기 6 추가, SC-013 · SC-014 추가 |
| Q2 기억 그래프 | **범위 밖** | Assumptions "명시적 범위 밖"으로 이동. 관계 연결(FR-028)은 범위 안, 시각화 화면만 제외 |
| Q3 외부 도구 개방 | **범위 밖** | Assumptions "명시적 범위 밖"으로 이동. 헌장 원칙 I 근거 기재 |

Q1 은 제시한 3개 선택지 중 B(단일 비밀번호)에 가까웠으나, 데이터베이스가 이미 Supabase 위에
있어(`apps/server/.env.example:1`, `packages/db/src/client.ts:16,27`) 계정 저장소와 인증 API 가
새 인프라 없이 딸려 온다는 점을 확인해 관리형 인증으로 확정했다. 비밀번호를 직접 저장 · 해시하지
않게 되어 B 보다 표면이 작다.

### "No implementation details" 항목에 대한 판단

Assumptions 의존 절에 제공자 이름(Supabase)이 등장한다. 템플릿이 그 절을 "Dependency on
existing system/service" 용도로 명시하고 있어 위반으로 보지 않았다. 기능 요구(FR-043~046)는
전부 관찰 가능한 행동으로만 적었고 제공자 · 프로토콜 · 라이브러리 이름을 담지 않는다.

### 계획 단계로 넘기기 전 처리할 것 (스펙 밖)

- **헌장 개정 필요**: `.specify/memory/constitution.md` 의 "스택" 절에 인증 제공자가 없고,
  Governance 는 스택 변경을 개정 사항으로 규정한다. 로그인 도입은 MINOR 개정에 해당한다.
- 범위 밖으로 확정된 두 건의 잔재: `packages/validation/src/memory.ts` 의 `graphifyInputSchema`,
  `apps/server/src/app.ts` 의 `/mcp` 예고 주석. 소비자가 없으므로 정리 대상이다.

**`/speckit-clarify` 세션(2026-09-10)에서 소비자를 잃은 계약** — 계획 단계에서 정리한다:

| 대상 | 사유 |
| --- | --- |
| `memories.source` 컬럼, `saveInputSchema.source` | 기억이 출처를 기록하지 않기로 확정(Q1 → FR-015) |
| `saveInputSchema.skipIfDuplicate` | 중복 판정을 하지 않기로 확정(Q2 → FR-011) |
| `saveResultSchema` 의 `skipped: true` / `duplicates` 갈래 | 같은 사유. 판별 유니온이 단일 갈래로 접힌다 |
| `STRUCTURE.md` 이관 지도의 "save.ts → 중복 방지(유사도 임계값) 포함" | 이관 대상에서 제외됨 |

### 통과 근거 (선별)

- **구현 세부 배제**: 프레임워크 · 프로토콜 · 라이브러리 이름을 기능 요구에서 뺐다. 스택 결정은
  헌장에 있고 스펙은 참조하지 않는다. 외부 의존은 역할로만 적었다.
- **측정 가능성**: SC-001~014 전부 수치 또는 이진 판정을 갖는다. SC-011 · SC-013 은 검증 방법까지
  적었다.
- **범위 경계**: Assumptions "명시적 범위 밖"에 13개 항목을 열거하고 각각 근거 문서를 달았다.
- **독립 검증 가능성**: 사용자 이야기 6개 각각에 Independent Test 를 달았다. P1 두 개는 서로
  없이도 검증되고(이야기 2 는 기억을 직접 주입), 이야기 6 은 기억 · 대화 기능 없이 검증된다.
