# Data Model: 주제 대화

## conversations (기존 표 — 열 하나 추가)

| 열 | 형 | 변경 | 설명 |
|---|---|---|---|
| `project` | `text null` | **추가** | 이 방이 묶인 주제(= `memories.project`). null 이면 주제 없는 방 |

인덱스: `conversations_user_project_idx (user_id, project) where project is not null` — 주제 방 찾기 · rename 용.
**유일하지 않다**(research R2).

마이그레이션: `0016_topic_rooms.sql` — `alter table add column` + 인덱스. 기존 행은 전부 null(운영 "나비스" 방 4개).

### 방의 종류

| 종류 | `is_main` | `project` | 목록에 보임 | 기억 범위 | 지우기 |
|---|---|---|---|---|---|
| "나비스" 방 | true | null | 맨 위 고정 | 모든 기억 | 불가(409) |
| 주제 방 | false | 주제 이름 | 최근 대화순 | 그 주제 + 개인(기본), 넓히면 전체 | 가능 — 기억은 남음 |
| 주제 없는 방(예전) | false | null | 안 보임 | — | — |

### 규칙

- **제목 = 주제 이름.** 주제 방을 만들 때 `title = project`. rename 때 둘을 함께 바꾼다(R7).
- **주제 하나에 방 하나(기본).** `openTopicRoom(userId, project)` 는 같은 회원 · 같은 `project` 의 방이 있으면 그 중 최근 것을
  돌려준다. 합치기로 둘이 된 뒤에는 둘 다 목록에 남는다.
- **주제 이름 검증**: 앞뒤 공백 제거, 1–100자(기존 `projectSchema` 와 같은 뜻). 화면은 `projectKey` 가 같은 기존 주제가 있으면
  그것을 쓸지 묻는다(FR-002) — 서버는 막지 않는다(기억 저장의 표기 경고와 같은 결정).
- **기억은 방에 속하지 않는다.** 방을 지워도 `memories` 는 그대로(기존 FR-015).

## memories (변경 없음)

`project` 열을 그대로 쓴다. 개인 기억 = `project is null`.

## 와이어 (validation)

### `ConversationSummary` · `Conversation` — 필드 추가

| 필드 | 형 | 설명 |
|---|---|---|
| `project` | `string \| null` | 주제 방이면 주제 이름 |
| `memoryCount` | `number \| null` | 요약에만. 주제 방이면 그 주제의 기억 수(정확히 그 프로젝트만), 아니면 null |

### `topicRoomCreateInputSchema` (새)

```
{ project: string (trim, 1–100) }
```

### 기억 도구 입력 — 필드 추가 (`memory.ts`)

| 스키마 | 필드 | 뜻 |
|---|---|---|
| `recallInputSchema` · `recentInputSchema` · `todosInputSchema` | `everywhere?: boolean` | 주제 방에서 이번 호출만 모든 기억에서 |
| `saveInputSchema` | `personal?: boolean` | 주제 방에서 주제 없이 개인 기억으로 |

focus 가 없는 자리(“나비스” 방 · 약속 · 전하기 · 외부 MCP)에서는 두 필드 모두 효과가 없다.

## 상태 전이

주제 방: (없음) —만들기/열기→ 있음 —rename→ 새 이름(제목 · project 함께) —지우기→ (없음, 기억은 남음)
