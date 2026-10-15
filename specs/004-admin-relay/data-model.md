# Data Model: 전하기 (specs/004)

## 새 표: `relays`

관리자가 한 회원에게 맡긴 지시 하나. 한 번 실행되고 끝난다(research R1).

| 열 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | `crypto.randomUUID()` |
| `sender_id` | uuid NOT NULL | 보낸 관리자. 토큰 주인(R3). 목록 · 보존은 이 열로 좁힌다 |
| `recipient_id` | uuid NOT NULL | 받는 회원. 기억 · 대화방 · 전달이 이 회원의 것 |
| `recipient_label` | text NOT NULL | 보낼 때의 표시(이메일 등). 기록 화면용 — 매번 `auth.users` 를 다시 읽지 않는다 |
| `instruction` | text NOT NULL | 지시 원문. 1–1000자(약속 지시와 같은 상한 — FR-008) |
| `status` | text NOT NULL | `pending` · `running` · `delivered` · `failed` |
| `error` | text NULL | `failed` 일 때 사람이 읽는 이유(R9 — 모델 출력 아님) |
| `message_id` | uuid NULL | 도착한 메시지. 내부 추적용 — 와이어로 나가지 않는다(R9) |
| `lease_until` | timestamptz NULL | 실행 임대. 약속과 같은 `LEASE_MS` |
| `created_at` | timestamptz NOT NULL default now() | 보낸 시각 |
| `finished_at` | timestamptz NULL | 전함 · 실패 시각 |

인덱스:
- `relays_pending_idx` on `(created_at)` where `status in ('pending','running')` — tick 조회.
- `relays_sender_created_idx` on `(sender_id, created_at desc)` — 기록 목록 · 보존 정리.

외래 키는 걸지 않는다(회원은 다른 스키마 — `memories.user_id` 와 같은 이유). `message_id` 도 걸지 않는다 — 받는 회원이 방을
지워도 전하기 기록은 남는다.

### 상태 전이

```text
pending ──(tick 선점: lease 걸고 running)──▶ running ──(deliver 불림)──▶ delivered
                                                 ├──(deliver 안 불림 · 예외)──▶ failed
running ──(lease 만료: 서버가 멈춤)──▶ failed("서버가 실행 중에 멈췄어요.")
```

- 재시도는 없다. 실패한 것을 다시 보내려면 관리자가 같은 지시로 새로 보낸다(US3-2) — 새 행.
- 약속과 달리 lease 가 만료된 `running` 을 다시 집지 않고 실패로 닫는다. 이미 `deliver` 했는데 기록 직전에 죽었으면 다시 집을 때
  같은 말을 두 번 전하게 된다 — 약속은 회차 기록으로 막지만 전하기는 한 번짜리라 닫는 편이 단순하다.

### 보존

`relay.create` 가 넣은 뒤, 같은 `sender_id` 의 최근 50개 밖의 **끝난**(`delivered` · `failed`) 행을 지운다.

## 바뀌는 것: `messages.meta`

| 키 | 언제 | 와이어(`Message`) |
|---|---|---|
| `relayId` (새) | 전하기로 도착한 메시지 | **싣지 않는다**(R8) |
| `origin` (기존) | 약속 메시지 | 그대로 |

스키마 변경 없음(jsonb). domain 의 `MessageMeta` 내부 타입에 `relayId?: string` 을 더하고, 행 → 와이어 매핑에서 뺀다.

## 읽기만 하는 것: `auth.users` (Supabase)

`member.list()` 가 `select id, email from auth.users where deleted_at is null and (banned_until is null or banned_until < now())`
로 읽는다. drizzle 스키마 · 마이그레이션에 넣지 않는다(R4). 없으면(42P01) `select distinct user_id from conversations`.

`Member` (domain 내부 · 와이어 공통):

```ts
{ id: string; label: string }   // label = email ?? id.slice(0, 8)
```

와이어로는 관리자에게만 나간다(`GET /relays/members`).

## validation (`@navis/validation`, 새 파일 `relay.ts`)

- `relayCreateInputSchema`: `{ recipientId: uuid, instruction: string(1..1000, trim) }` — 화면 입구. 화면은 목록에서 고르므로 uuid 를 쓴다
  (도구 입력이 아니라 원칙 II 의 "모델이 지어낼 자리"가 아니다).
- `relayToolInputSchema`: `{ to: string(1..200), instruction: string(1..1000) }` — 대화 도구 입구(R5).
- `relayDeliverInputSchema`: `{ text: string(1..4000) }` — 전하기 턴 도구.
- `relayItemSchema`: `{ id, to, instruction, status, error: string|null, createdAt, finishedAt: string|null }`.
- `memberSchema`: `{ id: uuid, label: string }`.
