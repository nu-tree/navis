# 계약 — 회원 신원 전달 (web BFF → server)

001 의 [server-http.md](../../001-core-memory-chat/contracts/server-http.md) 의 모든 엔드포인트가 그대로
있고, **요청마다 회원이 하나 붙는다**는 점만 달라진다.

## 헤더

| 헤더 | 값 | 누가 붙이나 |
| --- | --- | --- |
| `Authorization` | `Bearer <API_TOKEN>` | BFF (001 그대로) |
| `x-navis-user` | 회원 uuid, 또는 `owner` | BFF — 세션을 확인한 **뒤에만** |

- `owner` 는 로그인이 꺼진 로컬 개발(`unconfigured`)에서만 쓴다. server 가 `NAVIS_OWNER_ID` 로 바꾼다.
- BFF 는 브라우저가 보낸 `x-navis-user` 를 **넘기지 않는다**(헤더 화이트리스트).

## server 의 판정 (`app.use("*")`)

| 경로 | 인증 | 회원 |
| --- | --- | --- |
| `/health` | 없음 | 없음 |
| `/mcp` | `NAVIS_MCP_TOKEN` | **항상 `NAVIS_OWNER_ID`** — 헤더를 보지 않는다 |
| 그 밖 전부 | `API_TOKEN` | `x-navis-user` 필수. 없음 · uuid 아님 · `owner` 가 아닌 문자열 → **401** |

판정 결과는 Hono 컨텍스트 변수 `userId` 로 라우트에 전달된다. 라우트는 그 값만 쓴다.

## 남의 데이터

| 상황 | 응답 |
| --- | --- |
| 남의 기억 id 로 `PATCH` · `DELETE` · `neighbors` | **404** (없는 id 와 같다) |
| 남의 방 id 로 `GET` · `DELETE` · 메시지 삭제 | **404** |
| 남의 방 id 로 `POST /chat` | 스트림을 열기 전에 **404** — 질문을 기록하지 않는다 |
| 남의 turnId 로 `POST /chat/cancel` | `{ ok: true, found: false }` — 멈추지 않는다 |
| 목록 · 검색 · 할 일 · 프로젝트 · 내보내기 · 설정 상태 | 자기 것만. 남의 것은 결과에 없다 |

"권한 없음(403)"을 쓰지 않는다 — 남의 데이터가 **있다는 사실**이 샌다(FR-103, SC-102).
