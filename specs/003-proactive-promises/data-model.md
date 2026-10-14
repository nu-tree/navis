# Data Model: 먼저 말 거는 나비스 — 약속

**Feature**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

모든 표는 `user_id`(Supabase 회원 uuid, 외래 키 없음)를 가지며 모든 조회는 회원으로 좁힌다(specs/002).
남의 행은 "없음"이다.

## promises (신규)

| 열 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | `crypto.randomUUID()` |
| `user_id` | uuid not null | 주인 |
| `instruction` | text not null | 자연어 지시 한 문장. 1~1,000자 |
| `label` | text not null | 화면 · 출처 표시용 짧은 요약. 모델이 정하고, 최대 40자 |
| `schedule_kind` | text not null | `once` \| `cron` |
| `run_at` | timestamptz null | `once` 일 때 실행 시각 |
| `cron` | text null | `cron` 일 때 식. 항상 Asia/Seoul 로 해석 |
| `memo` | text not null default '' | 나비스의 상태 메모. 최대 2,000자 |
| `enabled` | boolean not null default true | 켜짐 |
| `next_run_at` | timestamptz null | 다음 실행. 꺼졌거나 끝나면 null |
| `last_run_at` | timestamptz null | 마지막 실행 시작 |
| `lease_until` | timestamptz null | 실행 임대(R3) |
| `consecutive_failures` | int not null default 0 | 연속 실패 수(R11) |
| `origin_conversation_id` | text null | 만든 대화방. 방이 지워져도 남는다 |
| `ended_at` | timestamptz null | 끝난 시각(한 번짜리 실행 완료 · `finish` · 사용자 삭제 아님) |
| `created_at` / `updated_at` | timestamptz | |

**인덱스**
- `promises_due_idx` on `(next_run_at)` WHERE `enabled`: tick 조회(R3)
- `promises_user_idx` on `(user_id, next_run_at)`: 화면 목록

**규칙**
- `schedule_kind = once` 이면 `run_at` 은 not null, `cron` 은 null이다. 반대도 같다(CHECK).
- 켜진 약속은 회원당 최대 20개다(FR-006). 생성 · 다시 켜기 때 domain 이 센다.
- 반복 간격은 최소 1시간이다(FR-005). 다음 24회차로 검증한다(R6).

**상태 전이**

```
          create
            │
            ▼
  ┌──────► 켜짐(enabled, next_run_at 있음) ──── 끄기 ────► 꺼짐(enabled=false, next_run_at=null)
  │         │  ▲                                              │
  │   실행  │  │ 반복: 다음 회차                              │ 다시 켜기: 지금 이후 첫 회차
  │         ▼  │                                              │
  │       실행 중(lease_until > now)                          │
  │         │                                                 │
  │         ├─ once 완료 · finish 도구 ─► 끝남(enabled=false, ended_at)
  │         └─ 반복 3회 연속 실패 ─────► 꺼짐 + 메인 방 알림
  └──────────────────────────────────────────────────────────┘
  지우기: 어느 상태에서든 행 삭제(promise_runs 도 함께)
```

## promise_runs (신규)

| 열 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `promise_id` | uuid not null → promises.id ON DELETE CASCADE | |
| `user_id` | uuid not null | |
| `scheduled_for` | timestamptz not null | 이 회차의 예정 시각 |
| `started_at` / `finished_at` | timestamptz | |
| `status` | text not null | `running` \| `spoke` \| `silent` \| `failed` |
| `error` | text null | 실패 이유(사람이 읽는 말) |
| `message_id` | uuid null | `spoke` 일 때 남긴 메시지 |

**인덱스**: `(promise_id, started_at desc)`

**규칙**
- 약속마다 최근 20개만 남기고 오래된 것은 실행 끝에 지운다. 화면은 최근 몇 개만 본다.
- 임대가 만료된 `running` 은 다음 tick 이 `failed`("서버가 실행 중에 멈췄어요")로 닫는다.

## messages (신규 — conversations.messages jsonb 대체, R7)

| 열 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | 기존 메시지 id 를 그대로 옮긴다 |
| `seq` | bigint generated always as identity | 정렬 · 커서 |
| `conversation_id` | text not null → conversations.id ON DELETE CASCADE | |
| `user_id` | uuid not null | |
| `role` | text not null | `user` \| `assistant` |
| `text` | text not null | |
| `meta` | jsonb not null default '{}' | `toolsUsed` · `saved` · `origin` |
| `created_at` | timestamptz not null | |

**인덱스**: `messages_conversation_seq_idx` on `(conversation_id, seq desc)`

**와이어 계약**(`@navis/validation` `messageSchema`)에 추가하는 필드:

```ts
origin?: {
  kind: "promise" | "promise-disabled";
  promiseId: string;
  label: string;   // "⏰ 약속: {label}" 로 표시
}
```

`meta` ↔ 일급 필드 매핑은 domain 이 한다. memories 의 metadata 와 같은 방식이다.

**마이그레이션**
- `0011`: 표를 만들고 기존 jsonb 를 `jsonb_array_elements … WITH ORDINALITY` 순서대로 옮긴다. `createdAt`
  문자열 → timestamptz, `images` 는 버린다(원래 저장하지 않음).
- 배포 후 메시지 수 대조(quickstart S0) → `0012` 에서 `conversations.messages` 를 제거한다.

## conversations (변경)

| 변경 | 열 | 설명 |
|---|---|---|
| 추가 | `is_main boolean not null default false` | "나비스" 방. 부분 유일 인덱스 `(user_id) WHERE is_main` |
| 추가 | `session_turns int not null default 0` | 현재 세션으로 이어 쓴 턴 수(R8). 30 이상이면 교체 |
| 제거(0012) | `messages jsonb` | `messages` 표로 이전 |

**규칙**
- 메인 방은 지울 수 없다. 제목은 "나비스"로 고정이다.
- 약속 메시지가 들어오면 `session_id = null`, `session_turns = 0` 이 되고, `updated_at` 을 갱신한다(목록 맨 위 ·
  "답이 온 방" 표시).

## 와이어 계약 변경 요약 (`@navis/validation`)

- `messageSchema` + `origin`
- `conversationSchema`: `messages` → 첫 페이지 `messages`(최근 50) + `hasMore: boolean`, `isMain: boolean`
- `conversationSummarySchema`: `messageCount` 제거, `isMain` 추가
- `messagePageSchema`: `{ messages: Message[], hasMore: boolean }`
- `promiseSchema` · `promiseRunSummarySchema` · `promiseUpdateInputSchema`
- 도구 입력: `promiseCreateInputSchema` · `promiseUpdateToolInputSchema` · `promiseIdInputSchema` ·
  `notifyInputSchema` · `setMemoInputSchema` · `finishInputSchema`
