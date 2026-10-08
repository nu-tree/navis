# 계약 — 기억 MCP 의 회원 묶기

001 의 [memory-mcp.md](../../001-core-memory-chat/contracts/memory-mcp.md) 의 도구 · 설명 · 오류 규칙은
그대로다. 바뀌는 것은 **서버를 만들 때 회원을 묶는다**는 것 하나다.

```
createMemoryMcpServer({ userId, tally })
```

| 쓰는 곳 | userId |
| --- | --- |
| 대화 턴(`chat.runTurn`) | 그 턴을 보낸 회원 |
| 외부 MCP(`/mcp`, Claude Code) | `NAVIS_OWNER_ID` |

- 모든 도구 핸들러는 클로저의 `userId` 로 domain 을 부른다.
- **도구 입력 스키마에 회원 id 가 없다.** 모델은 회원을 고를 수 없다 — 남의 id 를 지어낼 자리가
  없다(헌장 원칙 II).
- `update` · `remove` 에 남의 기억 id 가 오면 domain 이 `NotFoundError` 를 던진다 — 모델에게는
  "찾을 수 없다"로 전달된다.
- `save` 의 표기 경고(`similarProjects`)는 그 회원의 프로젝트끼리만 비교한다.
