# Contract: 기억 도구 — 주제 방의 초점

in-process 기억 MCP(`packages/domain/src/memory/mcp.ts`)의 도구가 **focus** 를 받는다. focus 는 서버를 만들 때 정해진다 —
도구 입력이 아니다. 모델은 focus 를 바꿀 수 없고, 예외만 말한다(research R3).

## 서버 컨텍스트

```ts
createMemoryMcpServer({ userId, tally, owner, focus? })
```

- `focus`: 주제 방의 `project`. "나비스" 방 · 약속 턴 · 전하기 턴 · 외부 MCP 에서는 없다.

## 도구별 규칙 (focus 가 있을 때)

| 도구 | 입력에 `project` 없음 | 입력에 `project` 있음 | 예외 필드 |
|---|---|---|---|
| `save` | `project = focus` 로 저장 | 입력이 이긴다 | `personal: true` → 주제 없이(개인 기억) |
| `recall` | `project = focus` (그 주제 + 개인 — 기존 기본 규칙) | 입력이 이긴다 | `everywhere: true` → 좁히지 않음 |
| `recent` | 같음 | 같음 | `everywhere: true` |
| `todos` | 같음 | 같음 | `everywhere: true` |
| 그 밖(`projects` · `rename_project` · `update` · `remove` · `guide`) | 변화 없음 | | |

- `personal` 과 `project` 를 함께 주면 `personal` 이 이긴다(모순은 개인 쪽으로 — 다른 방에서도 보이는 쪽).
- `everywhere` 와 `project` 를 함께 주면 `project` 가 이긴다(모델이 범위를 콕 집었다).
- focus 가 없으면 `everywhere` · `personal` 은 아무 효과가 없다.
- 도구 응답 첫 줄에 범위를 적는다 — 예: `범위: 이사 + 개인 기억` / `범위: 모든 기억`. 모델이 넓힐지 판단하는 근거다.

## 시스템 프롬프트 — "이 방의 주제" 절 (focus 가 있을 때만)

담는 것(짧게):
- 이 방은 '<focus>' 주제 방이다. 기억 도구는 알아서 이 주제 + 개인 기억으로 좁혀진다.
- 사용자가 '전체에서 · 다른 데서 얘기한 것도'라고 하면 그 호출에 `everywhere: true`.
- 사용자 자신에 관한 사실(생일 · 취향 · 건강 · 가족)은 `personal: true`. 다른 주제라고 말하면 그 `project`.
- 약속을 만들면 때가 되면 "나비스" 방으로 알린다고 확인 문장에 담는다(FR-020).
- 이 주제와 먼 얘기가 길어지면 그 주제 방으로 옮길지 한 번 제안할 수 있다.

## 테스트로 고정하는 것 (domain 순수 함수)

- focus 적용 함수(입력 + focus → 실제 범위)의 표 전체.
- `buildTurnTools` — focus 가 있으면 "이 방의 주제" 절이 붙고, 없으면("나비스" 방 · 약속 · 전하기) 없다.
