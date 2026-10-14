# Contract: HTTP

server(`apps/server`)와 web BFF(`apps/web/src/app/api`) 계약. 인증 규칙은 specs/002
`contracts/identity.md` 를 따른다. BFF 는 세션 확인 → `x-navis-user` + `NAVIS_API_TOKEN` 순서다. 스키마의 유일한
출처는 `@navis/validation` 이다.

---

## 약속 — 회원용

| server | BFF | 설명 |
|---|---|---|
| `GET /promises?includeEnded=1` | `GET /api/promises` | `Promise[]`, 다음 실행 순. 각 항목에 최근 실행 3개(`recentRuns`) |
| `PATCH /promises/:id` | `PATCH /api/promises/:id` | 본문 `{ enabled: boolean }`. 다시 켜면 상한 · 다음 회차 검사. 422(상한) · 404 |
| `DELETE /promises/:id` | `DELETE /api/promises/:id` | 204 · 404 |

화면에서는 약속을 **만들거나 문장을 고치지 않는다.** 만들기 · 고치기는 대화로만 한다(FR-003). 회원도 자기 약속을
지울 수 있다. 기억 지우기와 달리 관리자 제한이 없다. 약속은 쌓일수록 좋아지는 자산이 아니라 소음의 원천이다.

`Promise` 와이어 형태:

```ts
{
  id: string; label: string; instruction: string;
  schedule: { kind: "once"; at: string } | { kind: "cron"; cron: string; description: string };
  enabled: boolean; nextRunAt: string | null; lastRunAt: string | null;
  endedAt: string | null; consecutiveFailures: number;
  recentRuns: { startedAt: string; status: "running" | "spoke" | "silent" | "failed"; error: string | null }[];
}
```

## 내부 tick — Scheduler 전용

| server | web | 설명 |
|---|---|---|
| `POST /internal/tick` | `POST /api/internal/tick` | 기한이 된 약속을 선점해 실행한다. 실행이 끝날 때까지 응답을 붙든다(R2) |

- **인증**: `Authorization: Bearer <NAVIS_TICK_TOKEN>`. server 의 기본 잠금에서 이 경로만 이 토큰으로 연다.
  `API_TOKEN` · MCP 토큰으로는 열리지 않고, 이 토큰으로 다른 경로도 열리지 않는다. 토큰이 설정되지 않았으면 404.
- **web**: `/api/mcp` 와 같은 중계다. 세션을 보지 않고 web 토큰을 붙이지 않는다. `authorization` 헤더만 넘긴다.
  proxy matcher 는 이미 `/api` 를 제외한다.
- **응답**: `200 { claimed: number, results: { promiseId: string, status: string }[] }`. 할 일이 없으면
  `{ claimed: 0, results: [] }` 를 즉시 준다(모델 호출 없음, SC-006).
- 재시도 없음. 실패한 회차는 임대 만료 후 다음 tick 이 집는다.

## 대화방 — 변경

| server | BFF | 변경 |
|---|---|---|
| `GET /conversations` | 같음 | 호출 시 메인 방 보장(`ensureMain`). 정렬 `isMain desc, updatedAt desc`. `messageCount` 제거, `isMain` 추가. `lastMessage` 는 messages 표에서 한 행 |
| `GET /conversations/:id` | 같음 | `messages` 는 **최근 50개**(오래된 → 최근 순) + `hasMore` + `isMain` |
| `GET /conversations/:id/messages?before=<messageId>&limit=50` | 같음(신규) | `{ messages, hasMore }`. `before` 보다 앞선 것. limit 최대 100. 남의 방 · 없는 방 · 없는 `before` → 404 |
| `DELETE /conversations/:id` | 같음 | 메인 방이면 **409** `{ error: "나비스 방은 지울 수 없어요." }` |

## 대화 — 변경 (`POST /chat`)

계약(SSE 이벤트)은 그대로다. 내부 동작만 바뀐다.
- 기록 복원용 `history` 는 방 전체가 아니라 messages 표의 최근 20개다.
- 세션 교체 규칙(R8)을 적용한다. `session_turns >= 30` 이거나 `session_id` 가 비었으면 새 세션 + `withHistory`.
- 진행 중인 턴을 `turns` 레지스트리(회원 포함)에 올린다. 약속 실행이 이것을 보고 양보한다(R4).
