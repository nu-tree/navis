# navis — 나비스

> namory(기억 저장소)를 등에 업고 사용자와 양방향으로 대화하는 제2의 뇌 에이전트.
> Claude Agent SDK 두뇌(askClaude) + Web 표준 HTTP 핸들러. namory(기억)를 in-process MCP 로 붙인다.

- 이름: 라틴어 *navis*(배). namory(기억)를 싣고 오가는 배.
- 두뇌: Claude Agent SDK + Claude Code 구독 OAuth 토큰 (모델 전부 Opus 4.8)
- 기억: namory MCP (외부 HTTP)
- 자동화: 사용자 트리거 크론 + 주간 다이제스트 + 캘린더 알림

## 이 패키지의 위치

navis 는 **라이브러리**다 — 자체 서버(`listen`)가 없다. 두 층으로 나뉜다:

| 층 | 내용 |
| --- | --- |
| 두뇌 (`claude/*`) | Claude Agent SDK 호출, MCP 도구 조립, 시스템 프롬프트 |
| HTTP 핸들러 (`http/*`) | Web 표준 `(Request) => Response`. 라우팅은 `apps/web` 의 파일 라우터가 한다 |

예전에는 `src/index.ts` 가 Node HTTP 서버를 띄우고 자체 라우터(`http/router/*`)로
분기했으며, 터미널 CLI 모드도 있었다. 둘 다 삭제됐다 — 배포 단위는 `apps/web` 하나다.

## 폴더 구조

```
src/
├── config.ts            # env 로드 + 검증 (필수값은 getter — 읽는 시점에 검증)
├── system-prompt.ts     # 봇 성격 — namory(DB)→env→기본값, 캐시
├── digest.ts            # 주간 기억 다이제스트
├── project.ts           # 프로젝트 자동 감지 (.navis | package.json)
├── claude/
│   ├── ask.ts           # askClaude — 메인 LLM 호출
│   ├── curator.ts       # 사후 큐레이터 (save/recall만)
│   ├── images.ts        # 앱 첨부 이미지 디코드/리사이즈
│   ├── allowed-tools.ts # 도구 화이트리스트
│   └── types.ts         # InputImage, AskResult
├── http/                # Web 표준 핸들러 (chat, reports, conversations, settings, connectors, crons, memories, scheduler)
│                        #   index.ts 가 배럴 — apps/web 이 `navis/http` 로 가져간다
├── reports/             # 선제 보고 기록(emit) + DB 저장(store) + ntfy 푸시
├── cron/                # 크론 CRUD + cron MCP 도구
├── scheduler/           # 틱 기반 스케줄러 (발동 판정 + 원자적 클레임 실행)
├── settings/            # update_system_prompt MCP 도구
├── connectors/          # 동적 MCP 커넥터 — DB(store)→SDK 주입(mcp), OAuth(oauth), 제공자 프리셋(providers), 타입(types)
├── google/              # 캘린더 OAuth + 스케줄러 + MCP 도구
└── conversations/       # 대화 동기화 (namory 함수 직접 호출)
```

## 셋업

라이브러리라 자체 실행이 없다 — 레포 루트에서 웹 앱을 띄운다.

```bash
pnpm install
# 환경변수는 apps/web/.env.local 에 둔다 (.env.example 의 키들 참고)
pnpm --filter web dev            # 전체 API 로컬 실행
pnpm --filter navis typecheck    # 이 패키지만 타입 검사
```

### env 우선순위 (자동 로드)

`config.ts`가 `process.loadEnvFile()`로 첫 번째 존재하는 파일을 읽는다:

1. `./.env` (개발용)
2. `~/.config/navis/env` (글로벌 설치용 — XDG)
3. 이미 export된 `process.env` (Vercel 등 호스팅)

## Claude에 허용된 도구

`src/claude/allowed-tools.ts` 한 곳에서 관리.

| 카테고리 | 도구 | 권한 근거 |
| --- | --- | --- |
| namory MCP | `recall`, `recent`, `profile_show`, `pattern`, `todos`, `save`, `update` | 본 사용 흐름 |
| namory(제한) | `profile_update` | 다이제스트 경로(`allowProfileUpdate=true`)에서만 |
| 파일 | `Read`, `Write`, `Edit`, `NotebookEdit` | 코드 수정 |
| 셸 | `Bash`, `BashOutput`, `KillShell` | 빌드/실행/탐색 |
| 탐색 | `Glob`, `Grep` | 코드 탐색 |
| 웹 | `WebSearch`, `WebFetch` | 리서치 |
| 작업 추적 | `TodoWrite` | 긴 작업 분해 |
| 외부 MCP | `mcp__google` | env 토큰 있을 때만 |
| 크론 도구 | `cron_create`, `cron_list`, `cron_delete`, `cron_toggle` | 항상 |
| 설정 도구 | `update_system_prompt` | 사용자가 명시적으로 성격 변경 요청 시 |

> `delete`(기억 삭제)와 일반 경로의 `profile_update`는 절대 미허용 — 비가역 동작을 차단한다.
> 앱 `/api/chat` 은 단일 사용자 토큰(`APP_API_TOKEN`)으로 보호된다.

## 시스템 프롬프트(성격)

봇 성격은 `system-prompt.ts`가 1순위 namory(DB `settings.system_prompt`) → env `SYSTEM_PROMPT`(폴백) → 내장 기본값 순으로 정한다.
앱 설정 화면에서 편집하거나, 대화 중 "성격 바꿔줘"라고 하면 navis 가 `update_system_prompt` 도구로 직접 갱신(다음 턴부터 적용).

## 동적 MCP 커넥터 (`connectors/*`)

claude.ai 스타일 — 외부 HTTP MCP 서버(Notion·Linear 등)를 **코드 수정 없이 DB 등록만으로** 붙였다 뺀다.
목록은 namory `settings.connectors`(JSON 배열) 한 칸에 보관하고, `askClaude`가 매 query 직전 활성 커넥터를
`mcpServers`에 동적 주입한다(`buildEnabledConnectors`). 도구는 `mcp__<id>` 와일드카드로 자동 승인.

- **인증 타입**: `none` / `apikey`(임의 헤더+값) / `oauth`(Authorization: Bearer access token + 자동 갱신).
- **id**: 소문자/숫자/`_` 슬러그(=MCP 서버명). 내장 키(`namory`/`cron`/`settings`/`google`)는 예약어.

### OAuth 연결 (MCP-스펙 OAuth — Claude Desktop 방식)

데스크탑이 한 앱에 뭉쳐둔 OAuth 생애주기를 navis 는 **앱(브라우저 동의) + 백엔드(발견·등록·교환·저장·갱신)**
로 나눠 갖는다. 헤드리스 서버는 최초 동의만 못 하므로, 동의는 navis 앱(웹뷰+사람)에서 1회 받고 토큰은 백엔드가 굴린다.

**핵심: 사람이 OAuth 앱을 등록하지 않는다.** MCP 인가 스펙의 메타데이터 발견 + **Dynamic Client Registration(DCR)**
으로 `client_id` 를 런타임에 자동 발급받는다 — Claude Desktop 이 client_id 없이 "연결만 누르면" 되는 그 원리.

1. 앱이 `POST /api/connectors/oauth/start {provider}` (authed)
2. 백엔드가 MCP 서버 URL 에서 인가서버 메타데이터 발견(`.well-known/oauth-protected-resource` → `oauth-authorization-server`)
   → `registration_endpoint` 로 **DCR**(client_id 자동 발급) → PKCE authorize URL 반환
3. 앱이 브라우저로 동의 URL 오픈 → 사용자 로그인/동의
4. 제공자가 `GET /api/connectors/oauth/callback?code&state` 로 리다이렉트 → 백엔드가 토큰 교환(+`resource` RFC 8707)
5. refresh_token + 발견한 좌표를 커넥터 레코드에 저장 → `buildEnabledConnectors`가 사용 직전 만료 임박 시 자동 갱신(`refreshIfNeeded`)

redirect_uri 는 `NAVIS_PUBLIC_URL`(미설정 시 요청 헤더에서 자동 도출) + `/api/connectors/oauth/callback`.

**하이브리드 — 연결 시점에 자동 선택:**

- **DCR 지원 서버(Notion)** → `registration_endpoint` 로 client_id 런타임 자동 발급. **사전 설정 0**. 콜백도 동적 등록.
- **DCR 미지원 서버(Google Calendar)** → Google 은 DCR 을 안 하므로(Claude Desktop 도 Anthropic 이 등록해둔 client 를 씀) navis 가 **자기 client_id 를 미리 등록**해둬야 한다. 구글 캘린더 프리셋은 기존 캘린더용 자격(`config.google` = `GOOGLE_CLIENT_ID/SECRET`)을 그대로 재활용한다. scope 는 `calendar`(읽기+쓰기), `access_type=offline`+`prompt=consent` 로 refresh_token 확보.

> ⚠️ Google Calendar 연결 전 1회 작업: Google Cloud 의 OAuth 클라이언트(기존 캘린더용 그대로)의 **Authorized redirect URIs 에 `<navis>/api/connectors/oauth/callback` 추가**. 안 하면 `redirect_uri_mismatch`.
> 프리셋: `connectors/providers.ts` — DCR 형은 `{key,label,mcpUrl}`, classic 형은 `scopes`+자격 소스 추가.

### REST API (`/api/connectors`, `APP_API_TOKEN` Bearer)

- `GET    /api/connectors` — 목록(비밀값 마스킹)
- `GET    /api/connectors/providers` — OAuth 제공자 프리셋 + 사용가능 여부
- `POST   /api/connectors/oauth/start` — `{provider}` → `{authUrl}`
- `GET    /api/connectors/oauth/callback` — 제공자 콜백(브라우저, 인증 불필요·state 검증)
- `PUT    /api/connectors/:id` — 추가/수정(본문 `label`/`url`/`auth`/`enabled`/`alwaysLoad`; 전체 교체)
- `DELETE /api/connectors/:id` — 삭제

```bash
# 정적 키 MCP 직접 등록(self-host 서버 + 통합 토큰 등) — 즉시 가능, 코드 0줄
curl -X PUT "$NAVIS/api/connectors/linear" \
  -H "authorization: Bearer $APP_API_TOKEN" -H "content-type: application/json" \
  -d '{"label":"Linear","url":"https://mcp.linear.app/mcp","auth":{"type":"apikey","header":"Authorization","value":"Bearer lin_..."}}'
```

등록 후 최대 30초(캐시 TTL) 안에 다음 대화부터 도구가 붙는다. 앱에선 **설정 → 커넥터 관리**에서 GUI 로 처리.

## 자동화 (선제 보고)

크론·다이제스트·캘린더 등 navis 가 먼저 보내는 메시지는 모두 `/api/reports` 에 기록되고,
앱이 폴링해 보고 전용 방에 표시(네이티브 알림). 저장은 namory 의 `reports` 테이블.

### 사용자 트리거 크론 (`cron/*`)
앱 대화에서 "매일 ~ 해줘"라고 하면 모델이 `cron_create`로 등록하고, 영속화는 namory 의 `crons` 테이블이 한다.

실제 발동은 **틱 모델**이다 — 상주 프로세스가 없어 `node-cron` 을 쓸 수 없으므로, 외부 트리거(`.github/workflows/scheduler-tick.yml`, 5분 간격)가 `POST /api/scheduler/tick` 을 치고 `scheduler/tick.ts` 가 "직전 예정 발동시각 > 마지막 실행" 인 잡을 골라 DB 조건부 UPDATE 로 실행권을 클레임한 뒤 실행한다. 트리거가 몇 번 빠져도 다음 틱이 밀린 발동을 잡고, 중복 호출은 클레임에서 걸러진다. 발동 결과는 앱 보고로 기록(크론마다 방 1개).

### 주간 다이제스트 (`digest.ts`)
기본 매주 월 09시 KST — 최근 7일 기억을 navis가 요약하고 자기이해 프로필을 `profile_update`로 갱신, 요약을 앱 보고로 기록. 이 경로에서만 `profile_update` 허용 (인젝션 방어).

## 배포

배포 단위는 `apps/web` 이다 — 이 패키지는 그쪽에서 `navis/http` 로 import 된다.
환경변수·스케줄러 설정은 [DEPLOY.md](../../DEPLOY.md).
