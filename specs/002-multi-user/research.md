# Research: 여러 사람이 쓰는 나비스

스펙: [spec.md](./spec.md) · 계획: [plan.md](./plan.md)

---

## R1. 회원 신원을 server 에 넘기는 방법 (FR-107)

**결정**: BFF 가 세션(Supabase `getClaims()` 의 `sub`)을 확인한 뒤 **`x-navis-user: <uuid>`
헤더**를 붙여 server 를 부른다. server 는 `API_TOKEN`(Bearer)이 맞을 때만 이 헤더를 읽는다.

- BFF 는 브라우저 헤더를 화이트리스트(`content-type` · `accept`)로만 넘긴다(`lib/bff.ts`). 브라우저가
  `x-navis-user` 를 보내도 server 에 닿지 않는다 — 이미 그렇게 짜여 있고, 계약 테스트로 고정한다.
- server 는 인터넷에 열리지 않은 사이드카다(`localhost:4000`). `API_TOKEN` 을 쥔 호출자는 BFF 뿐이다.
- 헤더가 없거나 uuid 가 아니면 **401**. 기본값(관리자)으로 떨어뜨리지 않는다 — BFF 가 헤더를 빠뜨리는
  버그가 생기면 관리자 데이터가 새는 대신 막힌다.

**근거**: 헌장 원칙 II 는 인증을 web 에 둔다. server 는 "누구인가"만 알면 되고, 그 사실을 증명하는
것은 이미 있는 서버 토큰이다. 새 의존(JWT 검증 라이브러리 · JWKS 조회)이 없다.

**기각한 대안**
- *Supabase JWT 를 그대로 넘기고 server 가 검증*: 심층 방어로는 낫지만 server 가 인증 제공자를 알게
  된다(원칙 II 위반). 사이드카 구조에서 얻는 것이 적다.
- *BFF 가 짧은 서명 토큰(HMAC)을 만들어 넘김*: 서버 토큰과 같은 신뢰 경로를 한 번 더 만드는 것이다.

**로그인이 꺼진 로컬 개발**: BFF 의 `unconfigured` 분기에서 헤더 값으로 **`owner`** 를 보낸다.
server 는 `owner` 를 `NAVIS_OWNER_ID` 로 바꾼다. 설정된(로그인 켜진) BFF 는 이 분기를 타지 않는다.

---

## R2. 관리자(Owner)를 정하는 방법 (FR-110, FR-113, FR-114)

**결정**: server 환경변수 **`NAVIS_OWNER_ID`**(Supabase 사용자 uuid) — 부팅 필수.

- 외부 MCP(`/mcp`) 요청의 회원은 언제나 이 값이다.
- 기존 데이터 전환(R4)의 주인도 이 값이다.
- 없거나 uuid 가 아니면 server 가 뜨지 않는다(스펙 엣지 케이스 "관리자를 정하지 않은 채 배포").

**기각한 대안**: *DB 에 관리자 플래그*. 관리자는 한 명이고 배포 설정과 같은 수명이다. 테이블을
만들 이유가 없다(원칙 I).

---

## R3. 데이터를 회원으로 좁히는 위치

**결정**: **domain 함수가 회원 id 를 첫 인자로 받는다.** `save(userId, input)`, `recall(userId, input)`,
`conversation.list(userId)` … 모든 SQL 에 `user_id = $userId` 조건이 들어간다.

- 기억 MCP(대화 중 · 외부 MCP 둘 다)는 `createMemoryMcpServer({ userId, tally })` 로 **클로저에 회원을
  묶는다.** 도구 입력 스키마(`saveInputSchema` 등)에는 회원 id 가 없다 — 모델이 남의 id 를 넣을 자리가
  없다(헌장 원칙 II 개정 내용).
- 라우트는 Hono 컨텍스트 변수(`c.get("userId")`)에서 꺼내 domain 에 넘기기만 한다.

**근거**: 조건을 빠뜨리는 실수를 막는 가장 확실한 방법은 **인자 없이는 부를 수 없게** 만드는 것이다.
타입 검사가 누락을 잡는다.

**기각한 대안**
- *Postgres RLS(행 수준 보안)*: 연결마다 `set app.user_id` 를 해야 하는데, 풀러(transaction mode, 6543)
  위에서 세션 변수는 트랜잭션 밖으로 이어지지 않는다. 모든 질의를 트랜잭션으로 감싸야 해 복잡도가
  크다. 회원 수가 적은 지금은 앱 계층의 강제로 충분하다.
- *입력 스키마에 userId 추가*: MCP 도구 스키마와 HTTP 본문이 같은 스키마라 모델 · 브라우저에 노출된다.

---

## R4. 기존 데이터 전환 (FR-114, FR-115)

**결정**: 세 단계, 한 번의 점검 시간에 연달아 한다.

1. 마이그레이션 `0008`: `memories.user_id` · `conversations.user_id` · `settings.user_id` 를 **null 허용**으로
   추가하고 인덱스를 만든다.
2. 스크립트 `pnpm --filter @navis/db assign-owner`: `user_id is null` 인 행 전부를 `NAVIS_OWNER_ID` 로
   채운다(트랜잭션 하나). 몇 건을 옮겼는지 출력한다.
3. 마이그레이션 `0009`: 세 열을 `NOT NULL` 로, `settings` 의 PK 를 `(user_id, key)` 로 바꾼다.
   null 이 하나라도 남아 있으면 이 단계가 실패한다 — 주인 없는 행이 남지 않는다는 보증이다.

그 뒤 바로 새 코드를 배포한다. 3 과 배포 사이에는 옛 코드의 저장이 `NOT NULL` 에 걸려 실패한다 —
몇 분이고, 사용자 질문은 기록 실패로 화면에 알려진다. 1인 운영이라 점검 시간으로 감수한다.

**근거**: 헌장은 마이그레이션을 배포와 분리된 수동 단계로 둔다. SQL 마이그레이션은 관리자 uuid 를
모르므로(환경마다 다르다) 채우기는 스크립트가 한다. NOT NULL 을 별도 마이그레이션으로 둬야 "채우기가
끝났다"를 DB 가 검증한다.

**기각한 대안**
- *한 마이그레이션에서 기본값으로 채우기*: 관리자 uuid 를 SQL 에 박아야 한다.
- *새 코드가 null 을 관리자로 취급*: 주인 없는 행이 계속 생길 수 있다(FR-101 위반).

---

## R5. 회원으로 좁힌 벡터 검색 (FR-104, SC-105)

**결정**: `user_id` btree 인덱스 + 기존 HNSW 인덱스를 그대로 쓰고, 검색 트랜잭션에서
**`set local hnsw.iterative_scan = relaxed_order`** 를 켠다(pgvector ≥ 0.8).

**근거**: HNSW 는 필터 없이 가까운 후보를 먼저 뽑고 그 뒤에 `WHERE` 를 적용한다. 다른 회원의 기억이
많으면 후보 대부분이 걸러져 결과가 모자란다. iterative scan 은 모자라면 더 탐색한다. 지금은 행이
적어 플래너가 정확 검색(Seq Scan)을 고르므로 드러나지 않지만, 001 R6 처럼 규모가 커질 때 조용히
나빠지는 종류라 미리 맞춘다. `recall` 은 이미 `set local hnsw.ef_search` 를 쓰고 있다 — 같은 자리다.

로컬은 0.8.6 을 확인했다. 운영(Supabase)의 버전은 quickstart S0 에서 확인한다 — 0.8 미만이면
`iterative_scan` 설정이 오류를 내므로 그 줄만 빼고 `ef_search` 를 키운다.

**기각한 대안**: *회원별 부분 인덱스*. 회원이 생길 때마다 인덱스를 만들어야 한다.

---

## R6. 회원별 Claude 토큰 (FR-111, FR-112)

**결정**: `settings` 의 키를 `(user_id, key)` 로 하고, `claudeToken.*(userId)` 로 바꾼다. 평문 캐시는
`Map<userId, string | null>`. 턴마다 그 회원의 토큰을 `options.env` 로 넘긴다(001 그대로).

- 동시에 두 회원이 대화하면 Agent SDK 가 서브프로세스를 따로 띄우고 각자의 `env` 를 받는다 — 섞이지
  않는다.
- 암호화 키(`NAVIS_SETTINGS_KEY`)는 하나다. 분리는 행의 주인으로 하고, 암호화는 DB 유출을 막는다.

---

## R7. 진행 중인 턴과 중지 (FR-106)

**결정**: `inFlight` 맵의 값을 `{ controller, userId }` 로 바꾸고, `/chat/cancel` 은 **같은 회원**의 턴만
멈춘다. 다른 회원의 turnId 면 `found: false`(없는 것과 같게).

`activeConversations`(같은 방 동시 턴 방지)는 방 id 가 전역 유일이므로 그대로 둔다. 방 소유 확인은
`conversation.ensure(userId, id)` 가 한다(R8).

---

## R8. 방 id 충돌 (스펙 엣지 케이스)

**결정**: `conversations.id` 는 전역 PK 그대로. `ensure(userId, id)` 가 그 id 의 방이 **다른 회원의 것이면
NotFoundError** — 이어 쓰지 않는다. 방 id 는 브라우저의 `crypto.randomUUID()` 라 우연한 충돌은 사실상
없고, 이 분기는 남의 방 id 를 알아낸 경우를 막는다.

---

## R9. 공개 가입 막기 (FR-109)

**결정**: 코드 변경 없음 — 로그인 화면에 가입 수단이 이미 없다. 운영 단계로 Supabase 대시보드의
**"Allow new users to sign up" 을 끈다**(anon 키로 `signUp` API 를 직접 부르는 길을 막는다). 회원은
대시보드의 "Invite user" / "Add user" 로 만든다. quickstart S0 에 적는다.

---

## R10. 막힌 계정이 끊기는 시점 (FR-108)

**결정**: 요청마다 계정 상태를 인증 제공자에 묻지 않는다. Supabase JWT 만료를 **10분**으로 줄여, 막은
계정은 길어야 10분 안에 끊긴다. 즉시 끊어야 하면 대시보드에서 그 회원의 세션을 폐기한다.

**근거**: BFF 는 `getClaims()` 로 JWT 서명만 검증한다(네트워크 왕복 없음). 막힌 계정도 이미 발급받은
액세스 토큰이 유효한 동안은 통과한다. `getUser()` 로 매번 확인하면 목록 · 검색마다 수십~수백 ms 가
붙는다 — 헌장 성능 절이 막는 종류다. 회원 수가 작고 관리자가 직접 들이는 구조라 10분 창이면 충분하다.

**기각한 대안**: *BFF 에서 매 요청 `getUser()`* — 위 이유. *막힌 회원 목록을 나비스 DB 에 따로 둠* —
계정의 단일 출처가 둘이 된다.
