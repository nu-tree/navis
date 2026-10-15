# Contract: HTTP — 전하기

server(`apps/server`)와 web BFF(`apps/web/src/app/api`) 계약. 인증 규칙은 specs/002 `contracts/identity.md` 를 따른다.
스키마의 유일한 출처는 `@navis/validation` 의 `relay.ts` 다.

## 관리자 전용

| server | BFF | 설명 |
|---|---|---|
| `GET /relays/members` | `GET /api/relays/members` | `Member[]`, label 순. 관리자 자신도 포함 |
| `GET /relays` | `GET /api/relays` | `RelayItem[]`, 최신순, 최대 50 |
| `POST /relays` | `POST /api/relays` | 본문 `{ recipientId, instruction }` → 201 `RelayItem`(status `pending`) |

- **권한**: server 가 `isOwner(userId)` 로 거른다 — `/memories/:id` DELETE 와 같은 자리(`app.ts`)에서 `/relays*` 전체를 막는다.
  관리자가 아니면 **403** `{ error }`. BFF 는 판단하지 않고 넘긴다(헌장: 실제 잠금은 server).
- **POST 오류**:
  - 400 — 본문 검증 실패.
  - 404 — `recipientId` 가 회원 목록에 없음.
  - 409 `{ error, code: "claude_token_missing" }` — 관리자의 Claude 토큰 미등록(FR-023). 라우트가 `ClaudeTokenMissingError` 를 `kind` 로 판별해 409 로 바꾼다(문구로 판별하지 않는다 — 헌장 규약).
- `RelayItem` 와이어 형태:

```ts
{
  id: string;
  to: string;            // recipient_label
  instruction: string;
  status: "pending" | "running" | "delivered" | "failed";
  error: string | null;
  createdAt: string;     // ISO 8601
  finishedAt: string | null;
}
```

`messageId` · 지어진 문장은 어떤 응답에도 없다(FR-019).

## 내부 tick — 바뀌는 것

`POST /internal/tick` 은 약속과 함께 `pending` 전하기도 선점한다(research R2). 한 tick 의 선점 상한(5)은 합계다 — 전하기를 먼저 집는다
(관리자가 기다리는 중이고 한 번짜리다).

응답 본문의 `results` 항목에 `{ relayId, status }` 가 섞인다. 인증 · 스트리밍 규칙은 specs/003 그대로.

## 회원용 — 바뀌는 것

없음. 받는 회원의 `GET /conversations/:id/messages` 응답은 전하기 메시지를 평범한 assistant 메시지로 준다(`origin` 없음, research R8).
