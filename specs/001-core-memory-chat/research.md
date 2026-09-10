# Phase 0 — 조사와 결정

**기능**: 핵심 나비스 — 기억과 대화 | **날짜**: 2026-09-10

Technical Context 의 미해결 항목과 새로 들이는 의존을 여기서 정리한다. 각 항목은
**결정 / 근거 / 기각한 대안 / 남은 검증**으로 적는다. 근거는 저장소의 실물(설치된 타입 정의,
번들 문서, 기존 코드)에서 확인한 것만 쓴다.

---

## R1. 테스트 전략 — `NEEDS CLARIFICATION` 해소

**결정**: Vitest 를 도입하고 두 층만 자동화한다.

| 층 | 대상 | 이유 |
| --- | --- | --- |
| `packages/domain` 단위 | 순수 함수 — 시간 가중치 재정렬, 프로젝트 스코프 필터, 태그/완료 매핑, 내보내기 직렬화 | 외부 의존 없이 결정적이다 |
| `apps/server` 계약 | `app.fetch()` 직접 호출로 라우트 계약·인증·상태코드 | `app.ts` 가 `index.ts` 와 분리된 목적이 주석에 "테스트에서 app.fetch 를 직접 부를 수 있게"로 이미 적혀 있다 |

웹 훅·컴포넌트 단위 테스트와 E2E 는 하지 않는다.

**근거**: 스펙의 성공 기준 중 SC-005·SC-015·SC-016 은 결정적이라 자동화가 값어치를 한다.
반면 SC-003·SC-004·SC-018 은 모델 판단이 섞인 확률적 기준이어서 단위 테스트로 고정할 수 없고,
`quickstart.md` 의 수동 검증 시나리오로 다룬다.

**기각한 대안**
- *테스트 없음(현 상태)*: SC-015(메시지 유실 0건)를 서버 재시작 10회로 손으로 확인해야 한다.
  기록 시점 로직(R9)은 회귀가 조용히 생기는 종류다.
- *Playwright E2E*: 상주 서버 + 외부 모델 + 외부 임베딩에 걸려 느리고 불안정하다. 단일 사용자
  도구에 유지비가 과하다.

**⚠️ 헌장 개정 필요**: 헌장의 머지 조건은 `pnpm typecheck` 와 `pnpm lint` 뿐이다.
`pnpm test` 를 게이트에 추가하는 것은 **MINOR 개정**이다.

---

## R2. Supabase Auth 통합 — 어디서 세션을 검증하는가

**결정**: 세 지점으로 나눈다.

1. **브라우저** — Supabase 클라이언트로 **로그인/로그아웃만** 한다. 데이터 요청은 하지 않는다.
2. **`apps/web` 의 `src/proxy.ts`** — 쿠키만 읽는 **낙관적 리다이렉트**. 세션 없으면 `/login`
   으로 보낸다. 데이터베이스를 보지 않는다.
3. **`apps/web` 의 `/api/*` 라우트 핸들러** — **실제 인가**. 세션을 검증한 뒤에만
   `NAVIS_API_TOKEN` 으로 `apps/server` 를 부른다.

**근거**: 번들된 Next 16 문서가 두 가지를 못 박는다.

- `01-app/01-getting-started/16-proxy.md`: *"Starting with Next.js 16, Middleware is now called
  Proxy"* — 파일은 `src/proxy.ts`, 내보내기는 `proxy` 또는 default.
- 같은 문서: *"Proxy is not intended for slow data fetching … it should not be used as a full
  session management or authorization solution."* 그리고
  `02-guides/authentication.md` 의 "Optimistic checks with Proxy (Optional)" 절이
  *"only read the session from the cookie … avoid database checks"* 라고 적는다.

이 3층 구조는 `README.md` 가 이미 선언한 경로와 정확히 같다 —
"브라우저 → (세션 쿠키) → web 서버 → (서버가 쥔 토큰) → server". 빈 자리가 세션 쿠키였고
Supabase Auth 가 그 자리를 채운다. `apps/server` 는 사용자 신원을 계속 모른다(스펙 Assumptions).

**기각한 대안**
- *GoTrue REST 직접 호출*: 쿠키 갱신·PKCE 흐름을 손으로 구현해야 한다. 얻는 게 없다.
- *자체 비밀번호 저장*: 해시·회전·유출 대응 책임이 생긴다. 제공자가 이미 해준다.
- *브라우저가 Supabase 로 데이터까지 직접 읽기*: BFF 를 우회해 `apps/server` 가 무의미해지고,
  기억·대화에 행 수준 보안을 새로 설계해야 한다. 단일 사용자에 불필요하다.

**남은 검증**: `@supabase/ssr` 이 저장소에 **아직 없다**(grep 결과 주석 3줄뿐). Next 16 의
`proxy.ts` 규약과 이 패키지의 쿠키 어댑터가 맞물리는지 설치 후 확인한다.

---

## R3. 기억 MCP 를 프로세스 안에 붙이기 — API 실물 확인

**결정**: `createSdkMcpServer` + `tool()` 로 등록하고 `mcpServers` 로 넘긴다.
`tools: []` 는 **그대로 유지한다.**

설치된 `@anthropic-ai/claude-agent-sdk@0.3.263` 의 `sdk.d.ts` 에서 확인한 실제 시그니처:

```
createSdkMcpServer(_options: CreateSdkMcpServerOptions): McpSdkServerConfigWithInstance
  CreateSdkMcpServerOptions = { name, version?, instructions?, tools?: SdkMcpToolDefinition[] }

tool<Schema extends AnyZodRawShape>(name, description, inputSchema, handler, extras?)
  → SdkMcpToolDefinition<Schema>
  handler: (args, extra) => Promise<CallToolResult>
  extras: { annotations?, searchHint?, alwaysLoad? }

Options.mcpServers?: Record<string, McpServerConfig>
```

**핵심 발견 — `tools: []` 는 MCP 도구를 막지 않는다.** `Options.tools` 의 문서 주석이
*"Specify the base set of available **built-in** tools. `[]` (empty array) — Disable all
built-in tools"* 라고 적는다. MCP 도구는 `mcpServers` 로 따로 등록되며 이 배열과 무관하다.

즉 헌장 보안 절의 *"`tools: []` 가 기본이고, 기억 MCP 의 도구만 명시적으로 연다"* 가 별도
장치 없이 그대로 성립한다. `Read`/`Write`/`Edit`/`Bash` 는 계속 존재하지 않고 기억 도구만 열린다.

도구 이름 규약은 `mcp__<서버명>__<도구명>` 이다(타입 정의의 예시: `mcp__server__tool_name`,
`mcp__linear__create_issue`). 서버명을 `memory` 로 두면 `mcp__memory__save` 형태가 된다.

**기각한 대안**: *HTTP MCP*. `packages/domain/src/chat/index.ts` 주석과 `STRUCTURE.md` 1항이
이것을 이전 구현의 "첫 토큰 ~1.6초 바닥(모델 무관)" 원인으로 지목하고, 헌장 성능 절이 금지한다.

**남은 검증 (중요)**: 서버는 비대화형이라 도구 승인을 물어볼 상대가 없다.
`allowedTools?: string[]` 의 주석은 *"These tools will execute automatically without asking the
user for approval"* 이다. `PermissionMode` 는
`'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'` 다.
`allowedTools: ['mcp__memory__save', 'mcp__memory__recall', …]` 없이 MCP 도구가 자동 실행되는지
실측한다. `bypassPermissions` 는 쓰지 않는다 — 내장 도구가 없어 실질 위험은 낮지만, 허용 목록을
명시하는 편이 헌장 보안 절의 "기본 잠금" 방향과 같다.

---

## R4. ⚠️ 모델 id 불일치 — 런타임 실패 위험

`packages/validation/src/chat.ts` 의 `SELECTABLE_MODELS` 에
`"claude-haiku-4-5-20251001"` 이 들어 있다. 확인한 것:

- Agent SDK `sdk.d.ts` 의 모델 예시는 날짜 접미사가 **없다** —
  `'claude-sonnet-5'`, `'claude-opus-4-8'`, `'claude-fable-5'`. 별칭
  `'opus' | 'sonnet' | 'haiku'` 도 받는다.
- `sdk.d.ts` 전체에 `claude-haiku-4-5*` 문자열이 **하나도 없다**(grep 0건) — 타입 쪽에서
  확정할 수 없다.
- Claude API 참조 자료는 Haiku 4.5 의 id 를 `claude-haiku-4-5` 로 적고, *"never append date
  suffixes"* 라고 명시한다.

**결정**: 확정 전까지 화면의 모델 선택기에 **기본 모델만** 노출한다. `claude-haiku-4-5` 와
`claude-haiku-4-5-20251001` 을 각각 한 턴씩 돌려 실측한 뒤 `SELECTABLE_MODELS` 를 고친다.

**근거**: `SELECTABLE_MODELS` 의 주석이 *"서버의 화이트리스트 검증과 UI 의 선택기가 같은 목록을
봐야 한다"* 고 적혀 있다. 목록이 맞더라도 **값 자체가 틀리면** 사용자가 Haiku 를 고르는 순간
턴이 실패한다. FR-007 의 수용 조건이 여기 걸린다.

---

## R5. 임베딩 — Voyage AI

**결정**: Voyage AI 를 HTTP 로 직접 부른다(공식 TypeScript SDK 없음). 차원은 **1024 고정** —
`packages/db/src/schema.ts` 가 `vector("embedding", { dimensions: 1024 })` 로 이미 박아뒀고,
HNSW 인덱스도 그 위에 있다.

응답 파싱은 **가드를 넣는다**. `STRUCTURE.md` 8항이 이전 구현의
`json.data[0].embedding` 무가드 인덱싱을 지목한다 — 200 + 빈 `data` 면 `TypeError` 가
save/recall 밖으로 튄다. 빈 응답은 타입 있는 오류로 바꿔 FR-042 를 만족시킨다.

**남은 검증**: 1024 차원을 내는 정확한 모델명. 차원이 다른 모델을 쓰면 삽입이 실패한다.

---

## R6. 불러오기 정렬 — 시간 가중치를 어디서 계산하는가

**결정**: 두 단계로 나눈다.

1. **DB**: HNSW 코사인 거리로 후보 N 건(limit 의 약 4배, 상한 200)을 뽑는다. 순수 벡터
   근접 질의만 한다.
2. **애플리케이션**: `score = similarity × decay(age)` 로 재정렬해 상위 `limit` 을 반환한다.

**근거**: 시간 가중치를 SQL 의 `ORDER BY` 안에서 곱하면 **HNSW 인덱스를 타지 못하고** 전체
스캔이 된다. 후보를 넉넉히 뽑아 메모리에서 재정렬하면 인덱스를 살린 채 FR-017(대등하면 최근
우선)을 만족한다. 재정렬 함수는 순수 함수라 R1 의 단위 테스트 대상이다.

**기각한 대안**: *SQL 에서 직접 가중*. 기억이 1,000건일 때는 티가 안 나지만 SC-007 의 1초
예산을 인덱스 없이 지키는 건 규모가 커지면 무너진다.

---

## R7. 겹치는 기억 찾기 (FR-047)

**결정**: 전체 클러스터링을 하지 않는다. **"이 기억의 이웃"** 조회 하나를 제공하고, 기억 화면에서
항목을 펼치면 유사 이웃 상위 k 를 보여준다. 사용자가 남길 것을 고르고 나머지를 지운다.

**근거**: 전체 쌍 비교는 O(n²) 다. 이웃 조회는 그 기억의 벡터로 같은 HNSW 인덱스를 다시 타므로
비용이 기존 검색과 같다. 사용자의 훑는 흐름(목록 → 항목 → 이웃 → 정리)에도 맞는다.

**기각한 대안**: *그래프/클러스터 시각화*. `/speckit-clarify` Q2 에서 범위 밖으로 확정됐다.

---

## R8. 내보내기 형식 (FR-050)

**결정**: JSON 한 파일. `{ exportedAt, count, memories: [...] }`, 들여쓰기 2칸.

**근거**: FR-050 이 "나비스 없이도 사람이 읽을 수 있는 형식"을 요구한다. 들여쓴 JSON 은 사람도
읽고 기계도 읽는다. SC-016 의 "누락 필드 0건"을 스키마로 검증할 수 있다.

**기각한 대안**
- *CSV*: 태그 배열과 줄바꿈이 든 `content` 가 깨진다.
- *Markdown*: 사람만 읽는다. 나중에 복원 기능을 붙일 때(현재 범위 밖) 다시 만들어야 한다.

---

## R9. 메시지 기록 시점 (Q3=B 의 구현 형태)

**결정**: `/chat` 핸들러의 순서를 고정한다.

```
검증 → (방 없으면 생성) → 사용자 메시지 append → SSE 스트림 시작
     → … 델타 … → done 에서 어시스턴트 메시지 append + sessionId 저장
```

**근거**: FR-048·FR-049·SC-015. 스트림을 열기 **전에** 사용자 메시지가 커밋되어야 서버가
그 뒤 언제 죽어도 질문이 남는다.

**주의 두 가지**
- `conversations.messages` 가 jsonb 통짜라 append 가 read-modify-write 다. 단일 클라이언트·
  서버 권위라 경합이 없다는 것이 스키마 주석과 헌장의 근거다. 그래도 **같은 방의 동시 턴은
  서버에서도 막는다** — FR-008 은 클라이언트 측 방어라 새로고침으로 우회된다.
- 부분 답변은 기록하지 않는다(Q3 에서 C 를 고르지 않았다). FR-004 가 "새로고침하면 사라진다"로
  이미 명시한다.

---

## R10. 진행 중인 턴과 세션 id 의 보관 위치

**결정**
- `conversations.sessionId` → **DB**. `apps/server/src/routes/chat.ts` 의 프로세스 로컬
  `sessions` Map 을 대체한다(코드에 이미 `TODO` 로 적혀 있다). 이것이 US3 시나리오 2(재시작 후
  맥락 이어가기)의 조건이다.
- `inFlight` (AbortController) → **프로세스 로컬 유지**. 중지는 생성이 도는 그 프로세스에서만
  의미가 있고, 서버 인스턴스가 하나라 충분하다. 코드 주석의 판단을 그대로 따른다.

---

## 미해결로 남기는 것

| 항목 | 왜 남기는가 |
| --- | --- |
| 관측성(로깅·메트릭) | `/speckit-clarify` 에서 Deferred. 단일 사용자 도구라 임팩트가 낮다. 현재의 `console.error` 유지 |
| 인증 제공자 장애 시 동작 | Outstanding. 로그인 불가 = 접근 불가로 자연 축소되며, 별도 설계가 필요하지 않다 |
| 접근성 · 다국어 | Outstanding. 한국어 단일 사용자 전제 |
