# Phase 1 — 데이터 모델

**기능**: 핵심 나비스 — 기억과 대화 | **날짜**: 2026-09-10

저장 레이아웃(`packages/db/src/schema.ts`)과 와이어 계약(`packages/validation`)은 **일부러
다르다**. 그 매핑은 `packages/domain` 의 책임이다. 아래 표의 "저장" 열이 디스크, "와이어" 열이
경계를 넘는 모양이다.

---

## 기억 (Memory)

사용자에 대해 남긴 한 조각의 사실. **대화방을 참조하지 않는다**(FR-015, Q1).

| 필드 | 와이어 | 저장 | 규칙 |
| --- | --- | --- | --- |
| `id` | `string` | `uuid` PK, `defaultRandom()` | 서버가 만든다 |
| `content` | `string` | `text` NOT NULL | 최소 1자(FR-050 내보내기에서 누락 불가) |
| `category` | `Category \| null` | `text` nullable | `decision·learning·idea·feeling·people·todo` 중 하나. 값 집합의 단일 출처는 `@navis/validation` |
| `project` | `string \| null` | `text` nullable | `null` = 개인·전역 기억. 분류와 **직교하는 축**(FR-013) |
| `tags` | `string[]` | `metadata.tags` | 저장은 jsonb 안, 와이어는 일급 필드 |
| `done` | `boolean \| null` | `metadata.done` | `category === 'todo'` 일 때만 의미가 있다 |
| `createdAt` | `string` (ISO 8601) | `timestamptz` NOT NULL | 시간 가중치(R6)와 목록 정렬의 기준 |
| — | (밖으로 내보내지 않음) | `embedding` `vector(1024)` | 의미 검색용. HNSW + `vector_cosine_ops` |
| — | (제거 대상) | `source` `text` | **소비자를 잃었다** — Q1 에서 출처 미기록으로 확정 |

**관계**: 기억끼리 연결될 수 있다(FR-028). 연결은 `metadata.relatedIds` 에 둔다 — 별도 테이블을
만들지 않는다(헌장 원칙 I: 소비자가 하나뿐인 조인 테이블을 미리 만들지 않는다).

**생애**

```
생성(대화 중 자동 | 기억 화면에서 수동)
  → 수정  content 를 바꾸면 embedding 을 재계산한다(FR-024)
  → 완료 토글  category === 'todo' 인 경우만(FR-027)
  → 삭제  즉시 사라진다. 자동 만료는 없다
```

**중복은 판정하지 않는다**(FR-011, Q2). 같은 사실이 여러 건 공존할 수 있고, 정리는 이웃
조회(R7)로 사용자가 한다.

---

## 대화방 (Conversation)

| 필드 | 와이어 | 저장 | 규칙 |
| --- | --- | --- | --- |
| `id` | `string` | `text` PK | **클라이언트가 만든다** — 그래서 uuid 가 아니라 text PK |
| `title` | `string` | `text` NOT NULL | 첫 사용자 메시지에서 자동 생성(FR-034) |
| `messages` | `Message[]` | `jsonb` 통짜, 기본 `[]` | append 는 read-modify-write(R9) |
| `sessionId` | `string \| null` | `text` nullable | 이어갈 에이전트 세션. **방 단위**라 맥락이 섞이지 않는다(FR-031) |
| `createdAt` | `string` | `timestamptz` NOT NULL | |
| `updatedAt` | `string` | `timestamptz` NOT NULL | 목록 정렬 기준. `updated_at DESC` 인덱스 있음 |

**목록은 `messages` 를 싣지 않는다**(FR-032). 별도 모양을 쓴다:

```
ConversationSummary = Conversation - messages + { lastMessage: string | null, messageCount: number }
```

`STRUCTURE.md` 6항이 이전 구현의 `SELECT *` 를 지목한다 — 목록 질의는 필요한 열만 읽는다.

**생애**

```
생성  첫 사용자 메시지를 보낼 때(R9)
  → 메시지 추가  사용자 = 보낼 때 / 나비스 = 턴 완료 시(FR-048)
  → 삭제  메시지는 사라지고 기억은 남는다(FR-015)
```

이전 구현에 있던 `kind` · `unread` · `hidden` · `deletedAt` 은 **가져오지 않는다**. 전부 기기 간
Last-Write-Wins 동기화용이었고, 클라이언트가 하나면 필요 없다(스키마 주석).

> ⚠️ `apps/web/src/components/layout/sidebar.tsx` 의 `PLACEHOLDER_ROOMS` 에 `unread` 배지가
> 남아 있다. 계약에 `unread` 가 없으므로 배선할 때 함께 지운다.

---

## 메시지 (Message)

방 안의 한 발언. `conversations.messages` jsonb 의 원소이면서 동시에 와이어 계약이라
**DB · 서버 · 클라이언트 셋이 같은 정의를 본다**.

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | `string` | `crypto.randomUUID()`. `` `a${Date.now()}` `` 금지 — 같은 ms 안에서 충돌한다(FR-035) |
| `role` | `'user' \| 'assistant'` | |
| `text` | `string` | 사용자 글은 서식으로 해석하지 않는다(FR-005) |
| `createdAt` | `string` (ISO 8601) | |
| `toolsUsed` | `string[]?` | 표시용 라벨. 있을 때만 싣는다 |
| `images` | `string[]?` | data URL, 최대 8장. **저장 시엔 비운다** — 원본을 남기지 않는다 |

---

## 턴 (Turn)

**저장되지 않는다.** 프로세스 안에만 사는 실행 단위다.

| 것 | 위치 | 이유 |
| --- | --- | --- |
| `turnId` | 클라이언트가 생성, 요청 본문에 실림 | 중지의 식별자 |
| `AbortController` | `apps/server` 프로세스 로컬 Map | 중지는 생성이 도는 프로세스에서만 유효하다(R10) |

한 방에 진행 중인 턴은 **하나뿐이다**. 클라이언트도 막고(FR-008) 서버도 막는다 — 클라이언트
측 방어만 두면 새로고침으로 우회된다(R9).

---

## 설정 (Setting)

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `key` | `text` PK | 지금 쓰는 키는 나비스 성격 하나 |
| `value` | `text` NOT NULL | |
| `updatedAt` | `timestamptz` NOT NULL | |

우선순위: **DB → 환경변수 → 내장 기본값**(FR-036, FR-037). 빈 문자열로 저장하면 기본값으로
돌아간다. `getSetting` 의 빈 값 규약을 한쪽으로 통일한다 — 이전 구현에서는 `null` 과
`undefined` 가 공존했다(`domain/settings` 주석).

---

## 계정 (Account)

**나비스가 소유하지 않는다.** 관리형 제공자의 인증 스키마에 있고, 이 기능은 세션의 유효성만
본다(R2).

- `apps/web` 은 세션이 있는지만 확인한다.
- `apps/server` 는 사용자 신원을 **모른다**. `API_TOKEN` 만 검증한다.
- 기억 · 대화 · 설정에 **사용자 식별자 열을 추가하지 않는다**(스펙 Assumptions). 로그인은 문일
  뿐 데이터 소유자 구분이 아니다(FR-046).

다중 사용자로 가면 이 결정이 뒤집히고 세 테이블 전부에 마이그레이션이 필요하다. 범위 밖이다.

---

## 마이그레이션 영향

기존 스키마로 이 기능이 **거의 다 커버된다**. 필요한 변경:

| 변경 | 대상 | 근거 |
| --- | --- | --- |
| `memories.source` 제거 | 컬럼 삭제 | Q1 — 출처 미기록 확정 |
| 없음 | `conversations`, `settings` | 현 스키마로 충분하다 |

`source` 제거는 데이터 유실이므로 **선택**이다. 남겨두고 쓰지 않아도 동작에 지장이 없다.
지울 경우 `pnpm db:generate` → `pnpm db:migrate` 의 명시적 2단계를 따른다(헌장).
