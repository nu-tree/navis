# 계약 — `apps/server` HTTP

**소비자**: `apps/web` 의 서버 사이드(BFF)뿐. 이후 `apps/mobile`.
**인증**: `Authorization: Bearer <API_TOKEN>`. `/health` 만 예외.
**기본 잠금**: `app.use("*")` 로 전부 막고 예외만 나열한다. 보호할 경로를 나열하는 방식은
쓰지 않는다 — 라우트를 추가하다 하나 빠뜨리면 공개된다(헌장 보안 절).

모든 요청·응답 본문의 모양은 `@navis/validation` 의 zod 스키마가 **유일한 출처**다.

## 상태 코드 규약

| 코드 | 언제 | 근거 |
| --- | --- | --- |
| 400 | zod 검증 실패 | `{ error, detail: issues }` |
| 401 | 토큰 없음 · 불일치 | `bearerAuth` 가 처리 |
| 404 | 없는 기억 · 없는 방 | **타입 있는 오류**로 판정한다. 메시지 문자열로 분기하지 않는다(FR-041) |
| 409 | 같은 방에 진행 중인 턴이 있다 | FR-008 의 서버 측 방어(R9) |
| 502 | 외부 임베딩 · 모델 서비스 실패 | FR-042 — 조용히 실패하지 않는다 |

## 엔드포인트

### 대화

| 메서드 | 경로 | 요청 | 응답 | 요구 |
| --- | --- | --- | --- | --- |
| `POST` | `/chat` | `ChatRequest` | `text/event-stream` → [chat-stream.md](./chat-stream.md) | FR-001~008, FR-048 |
| `POST` | `/chat/cancel` | `CancelRequest` | `{ ok, found }` | FR-004 |

`POST /chat` 은 스트림을 열기 **전에** 방 생성과 사용자 메시지 기록을 커밋한다(R9).
연결을 끊는 것만으로는 생성이 멈추지 않는다 — 중지는 반드시 `/chat/cancel` 이 한다.

### 대화방

| 메서드 | 경로 | 요청 | 응답 | 요구 |
| --- | --- | --- | --- | --- |
| `GET` | `/conversations` | — | `ConversationSummary[]` | FR-032 — `messages` 를 싣지 않는다 |
| `GET` | `/conversations/:id` | — | `Conversation` \| 404 | FR-030 |
| `DELETE` | `/conversations/:id` | — | `{ ok }` \| 404 | FR-033. 기억은 남는다(FR-015) |
| `DELETE` | `/conversations/:id/messages/:messageId` | — | `{ ok }` \| 404 | 중단된 질문 정리(엣지 케이스) |

방 생성 전용 엔드포인트는 **만들지 않는다**. 첫 메시지를 보낼 때 `POST /chat` 이 만든다 —
쓰는 곳이 없는 라우트를 미리 만들지 않는다(헌장 원칙 I).

### 기억

| 메서드 | 경로 | 요청 | 응답 | 요구 |
| --- | --- | --- | --- | --- |
| `GET` | `/memories` | `RecentInput` (쿼리) | `Memory[]` | FR-021 |
| `POST` | `/memories` | `SaveInput` | `Memory` | 수동 추가 |
| `GET` | `/memories/search` | `RecallInput` (쿼리) | `RecallHit[]` | FR-022 |
| `GET` | `/memories/:id/neighbors` | `?limit` | `RecallHit[]` \| 404 | **FR-047** — 겹치는 기억 정리(R7) |
| `PATCH` | `/memories/:id` | `UpdateInput` | `Memory` \| 404 | FR-023, FR-024, FR-027 |
| `DELETE` | `/memories/:id` | — | `{ ok }` \| 404 | FR-025 |
| `GET` | `/memories/todos` | `TodosInput` (쿼리) | `Memory[]` | FR-026 |
| `GET` | `/memories/export` | — | `MemoryExport` | FR-050, FR-051 |

`SaveResult` 의 판별 유니온은 **단일 갈래로 접힌다**. Q2 에서 중복 판정을 하지 않기로 했으므로
`skipped: true` / `duplicates` 갈래에 소비자가 없다 — `POST /memories` 는 `Memory` 를 바로
돌려준다.

`MemoryExport` 는 새 스키마다: `{ exportedAt: string, count: number, memories: Memory[] }` (R8).

### 설정

| 메서드 | 경로 | 요청 | 응답 | 요구 |
| --- | --- | --- | --- | --- |
| `GET` | `/settings/persona` | — | `{ value: string, isDefault: boolean }` | FR-036 |
| `PUT` | `/settings/persona` | `{ value: string }` | `{ value, isDefault }` | FR-036, FR-037 |

`isDefault` 를 함께 내려보내야 화면이 "기본값이 적용 중"과 "사용자가 저장한 값"을 구분해
보여줄 수 있다(FR-036 수용 시나리오 1).

### 헬스

| 메서드 | 경로 | 인증 | 응답 |
| --- | --- | --- | --- |
| `GET` | `/health` | **없음** | `{ ok: true }` |

## 만들지 않는 것

| 경로 | 이유 |
| --- | --- |
| `/mcp` | 외부 도구 개방은 범위 밖(Q3). `app.ts` 의 예고 주석도 지운다 |
| `/memories/graph` | 그래프 시각화는 범위 밖(Q2). `graphifyInputSchema` 도 지운다 |
| `/auth/*` | `apps/server` 는 사용자 신원을 모른다(R2) |

---

# 계약 — `apps/web` BFF (`/api/*`)

**소비자**: 브라우저뿐.
**인증**: 세션 쿠키. 라우트 핸들러가 **실제 인가**를 한다(R2).
**규칙**: 브라우저는 이 층만 부른다. `NAVIS_API_TOKEN` 은 이 층 밖으로 나가지 않는다(FR-038).

| 경로 | 하는 일 |
| --- | --- |
| `POST /api/chat` | 세션 검증 → 업스트림 `POST /chat` → **스트림을 파싱하지 않고 그대로 흘린다** |
| `POST /api/chat/cancel` | 세션 검증 → 업스트림 중지 |
| `/api/conversations/*` | 세션 검증 → 업스트림 중계 |
| `/api/memories/*` | 세션 검증 → 업스트림 중계 |
| `/api/settings/*` | 세션 검증 → 업스트림 중계 |

스트림 중계 시 유지할 헤더: `content-type: text/event-stream`,
`cache-control: no-cache, no-transform`, `x-accel-buffering: no`.
중간에서 파싱·재직렬화하면 첫 토큰이 늦어지고 계약이 두 곳으로 갈라진다(헌장 성능 절).

세션이 없으면 **401 JSON** 을 돌려준다 — 리다이렉트하지 않는다. `fetch` 호출자가 HTML
리다이렉트를 받으면 파싱이 깨진다. 화면 전환은 `proxy.ts` 의 낙관적 리다이렉트가 맡는다.
