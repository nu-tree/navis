# Contract: HTTP — 주제 대화

server(`apps/server`)와 web BFF(`apps/web/src/app/api`) 계약. 인증 · 회원 격리는 specs/002 `contracts/identity.md` 를 따른다 —
모든 방 · 기억은 요청 회원의 것만, 남의 것은 404. 스키마의 유일한 출처는 `@navis/validation` 의 `conversation.ts` 다.

## 바뀌는 것

| server | BFF | 변경 |
|---|---|---|
| `GET /conversations` | `GET /api/conversations` | 요약에 `project` · `memoryCount`. 주제 없는 예전 방은 빠진다. 정렬은 그대로("나비스" 맨 위, 나머지 `updatedAt` 내림차순) |
| `GET /conversations/:id` | `GET /api/conversations/:id` | `project` 추가 |
| `POST /conversations` | `POST /api/conversations` | **새로**. 본문 `{ project }` → 그 주제 방. 새로 만들면 201, 이미 있으면 200. 응답 `ConversationSummary` |
| `DELETE /conversations/:id` | (기존) | 그대로. 주제 방 지우기에 쓴다. "나비스" 방은 409 |
| `POST /chat` | (기존) | 계약 그대로. 방에 `project` 가 있으면 그 턴의 기억 도구에 focus 가 걸린다(research R3 · R8) |

### `POST /conversations`

- 400 — 본문 검증 실패(빈 이름 · 100자 초과).
- 200/201 — `ConversationSummary`:

```ts
{
  id: string;
  title: string;          // = project
  sessionId: string | null;
  isMain: false;
  project: string;
  memoryCount: number;    // 그 주제의 기억 수(정확히 그 프로젝트만). 새 주제면 0
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
}
```

- 같은 회원 · 같은 `project` 의 방이 있으면 새로 만들지 않는다(FR-003). 표기만 다른 주제(`projectKey` 같음)는 다른 주제로 본다 —
  묻는 것은 화면의 몫이다(FR-002).

### 쓰는 기존 엔드포인트

- 칩의 기억 목록: `GET /memories?project=<주제>&exactProject=true` (기존). 개인 기억은 섞지 않는다 — 칩은 "이 주제의 기억"이다.
- 새 주제 고르기의 후보: `GET /memories/projects` (기존).
- 주제 이름 바꾸기 · 합치기: `POST /memories/projects/rename` (기존) — 이제 방의 `project` · 제목도 함께 바뀐다(research R7).
