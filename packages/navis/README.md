# navis — 나비스

> namory(기억 저장소)를 등에 업고 사용자와 양방향으로 대화하는 제2의 뇌 에이전트.
> 같은 두뇌(askClaude)를 **앱 백엔드(HTTP 서버)** · **터미널 CLI** 두 경로에서 공유한다.

- 이름: 라틴어 *navis*(배). namory(기억)를 싣고 오가는 배.
- 두뇌: Claude Agent SDK + Claude Code 구독 OAuth 토큰 (모델 전부 Opus 4.8)
- 기억: namory MCP (외부 HTTP)
- 자동화: 사용자 트리거 크론 + 주간 다이제스트 + 캘린더 알림

## 두 가지 실행 모드

| 모드 | 진입점 | 용도 |
| --- | --- | --- |
| HTTP 서버 | `src/index.ts` (`pnpm dev`, `pnpm start`) | always-on. 앱 API(/api/*) + 선제 보고 스케줄러(크론·다이제스트·캘린더) + GitHub webhook + 데스크톱 배포 |
| 터미널 CLI | `src/cli.tsx` (`pnpm cli`, `navis`) | Ink 기반 REPL. 프로젝트 자동 태깅 |

두 모드 모두 같은 `askClaude` + 사후 큐레이터(`curateTurn`)를 거치므로 저장·맥락 동작이 일관.

앱(navis-app: 모바일/데스크톱)은 `/api/chat`·`/api/chat/stream`(SSE)으로 navis 두뇌와 대화하고,
선제 보고는 `/api/reports`(폴링), 대화 동기화는 `/api/conversations`, 설정(시스템 프롬프트)은 `/api/settings`로 주고받는다.

## 폴더 구조

```
src/
├── cli.tsx              # CLI 진입점 (Ink REPL)
├── index.ts             # HTTP 서버 진입점 (앱 API + cron + digest + calendar + webhook + health)
├── config.ts            # env 로드 + 검증
├── system-prompt.ts     # 봇 성격 — namory(DB)→env→기본값, 캐시
├── digest.ts            # 주간 기억 다이제스트
├── project.ts           # 프로젝트 자동 감지 (.navis | package.json)
├── claude/
│   ├── ask.ts           # askClaude — 메인 LLM 호출
│   ├── curator.ts       # 사후 큐레이터 (save/recall만)
│   ├── images.ts        # 앱 첨부 이미지 디코드/리사이즈
│   ├── allowed-tools.ts # 도구 화이트리스트
│   └── types.ts         # InputImage, AskResult
├── http/                # 앱 API 라우터/핸들러 (chat, reports, conversations, settings, connectors, crons, memories, webhook)
├── reports/             # 선제 보고 기록(emit) + 인메모리 버퍼(store)
├── cron/                # node-cron 스케줄러 + namory REST + cron MCP 도구
├── settings/            # update_system_prompt MCP 도구
├── connectors/          # 동적 MCP 커넥터 — DB(store)→SDK 주입(mcp), OAuth(oauth), 제공자 프리셋(providers), 타입(types)
├── self-modify/         # request_self_modification MCP 도구 + PR 검토
├── google/              # 캘린더 OAuth + 스케줄러 + MCP 도구
└── conversations/       # 대화 동기화 namory REST 클라이언트
```

## 셋업

```bash
pnpm install
cp .env.example .env             # 토큰들 채우기
pnpm dev                          # HTTP 서버 모드(watch)
pnpm cli                          # 터미널 REPL 모드
```

### env 우선순위 (자동 로드)

`config.ts`가 `process.loadEnvFile()`로 첫 번째 존재하는 파일을 읽는다:

1. `./.env` (개발용)
2. `~/.config/navis/env` (글로벌 설치용 — XDG)
3. 이미 export된 `process.env` (Railway 등 호스팅)

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
- **id**: 소문자/숫자/`_` 슬러그(=MCP 서버명). 내장 키(`namory`/`cron`/`repo`/`self_modify`/`settings`/`google`)는 예약어.

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

## CLI 동작

- Ink(React-for-CLI) REPL — `‹` 입력선, `Static`으로 과거 턴 보존
- `Ctrl+C`로 종료, `/quit` `/reset` `/project` 슬래시 명령
- 시작 디렉터리에서 프로젝트 자동 감지(`.navis` 파일 → `package.json name`) → 이 대화의 `save` 호출이 자동으로 `project` 태깅

## 자동화 (선제 보고)

크론·다이제스트·캘린더 등 navis 가 먼저 보내는 메시지는 모두 `/api/reports` 에 기록되고,
앱/데스크톱이 폴링해 보고 전용 방에 표시(네이티브 알림).

### 사용자 트리거 크론 (`cron/*`)
앱 대화에서 "매일 ~ 해줘"라고 하면 모델이 `cron_create`로 등록. 실제 스케줄링은 navis(`node-cron`)가 하고, 영속화는 namory(`/crons` REST)가 한다. 발동 결과는 앱 보고로 기록(크론마다 방 1개).

### 주간 다이제스트 (`digest.ts`)
기본 매주 월 09시 KST — 최근 7일 기억을 navis가 요약하고 자기이해 프로필을 `profile_update`로 갱신, 요약을 앱 보고로 기록. 이 경로에서만 `profile_update` 허용 (인젝션 방어).

## 배포 (Railway)

- `Dockerfile` + `railway.json` 제공
- HTTP 서버: 앱 API(/api/*) + `/health` + `/webhook/github` + 데스크톱 배포(/download, /api/desktop/*)
- 필수 env: `CLAUDE_CODE_OAUTH_TOKEN`, `NAMORY_MCP_URL`, `NAMORY_TOKEN`, `APP_API_TOKEN`
- 선택 env: `SYSTEM_PROMPT`(폴백 — DB 비었을 때), `GITHUB_REPO`/`GITHUB_TOKEN`/`GITHUB_WEBHOOK_SECRET`(자기 개선), `GOOGLE_*`(캘린더), `DESKTOP_DIR`

## 자기 개선 (멀티 에이전트)

navis 가 자기 코드를 스스로 수정할 수 있는 4계층 흐름:

```
[너] → [① 메인 navis (오케스트레이터)]
              ↓ repository_dispatch
       [② Actions 안의 Claude Code (코드 수정 서브에이전트)]
              ↓ webhook (PR 생성)
       [③ navis 안의 검토 서브에이전트 (critic)]
              ↓
       [③ 검토 결과를 앱 보고로 기록] → [너]
```

비동기: ① 은 트리거만 던지고 즉시 응답, ② 는 격리 Actions 에서 작업, ③ 은 fire-and-forget. 앱 채팅은 막히지 않음.

### 셋업 (1회)

1. **GitHub PAT 권한 확장** — 기존 `GITHUB_TOKEN` PAT 에 **`Actions: Write`** 추가 (`Contents: Read` 는 이미 있음).
2. **GitHub Actions secret 등록** — `CLAUDE_CODE_OAUTH_TOKEN`(Max 구독 OAuth 토큰).
3. **Repo Settings → Actions → General → Workflow permissions** — `Read and write` + PR 생성 허용 체크.
4. **GitHub webhook 등록** — Payload URL `https://<navis-railway-url>/webhook/github`, content type `application/json`, secret 은 navis env `GITHUB_WEBHOOK_SECRET` 과 동일, 이벤트는 `Pull requests` 만.

### 사용

앱에서 그냥 자연어로:

```
너: navis야, packages/navis/src/claude/ask.ts 의 maxTurns 16 을 20 으로 올려줘
navis: 코드 수정 서브에이전트에게 작업 의뢰 전송 완료. 작업·검토가 끝나면 보고로
       알려주고, PR 은 GitHub 에서도 확인할 수 있어요.

[몇 분 뒤, 보고방에]

navis: 검토 서브에이전트 — PR #42: navis self-improve: maxTurns 20
       [요약] ask.ts maxTurns 16 → 20 한 줄 변경.
       [권고] 머지 OK.
       https://github.com/nu-tree/navis/pull/42
```

너는 PR 보고 머지만. Railway 자동 배포로 다음 응답부터 새 navis.

### 안전 게이트

- **변경 가능 경로 화이트리스트**: `packages/**/src/**` 만. `.github/**`, `Dockerfile`, `*.lock`, `.env*` 절대 금지.
- **빌드 통과 강제**: `pnpm -r build` 실패 시 PR 생성 자체 차단.
- **자동 머지 없음**: 항상 PR. 너 검토 강제.
- **webhook HMAC 검증**: secret 모르는 외부 요청은 401 거부.

## 글로벌 설치 (Homebrew)

```bash
brew tap nu-tree/navis
brew trust nu-tree/navis   # 서드파티 tap 신뢰(최신 brew 보안 요구 — 1회)
brew install navis
mkdir -p ~/.config/navis && $EDITOR ~/.config/navis/env  # env 채움
navis                                                     # 어디서나 실행
```

업데이트: `brew update && brew upgrade navis`.

### CLI 릴리스 자동화 (`.github/workflows/cli-release.yml`)

formula 는 별도 tap 레포 `nu-tree/homebrew-navis` 의 `Formula/navis.rb` 에 있다.
`main` 에 `packages/navis/**` 변경이 들어오면(또는 워크플로 수동 실행) 자동으로:

1. tap formula 의 현재 버전 +patch 로 새 태그(`vX.Y.Z`)를 찍어 push(이미 있으면 재사용),
2. 그 태그 소스 타르볼의 sha256 계산,
3. tap 의 `url`·`sha256` 갱신(+ 진입 래퍼 `dist/cli.js` 멱등 정규화)을 **한 커밋**으로 push.

버전 기준이 formula(마지막 성공 릴리스)라, 태그만 찍히고 갱신이 실패한 런도 다음 런이 같은
버전을 재시도해 버전 구멍 없이 자기복구된다.

→ 사용자는 `brew upgrade navis` 만 하면 새 버전을 받는다. 손으로 태그/sha 갱신 불필요.

> **사전 준비(1회)**: repo secret `HOMEBREW_TAP_TOKEN` 등록 — `nu-tree/homebrew-navis` 에
> `Contents: Read/Write` 권한이 있는 fine-grained PAT. 기본 `GITHUB_TOKEN` 은 현재 레포만
> 접근 가능해 다른 레포(tap)에 push 할 수 없어 별도 토큰이 필요하다. 미설정 시 워크플로는
> 태그까지만 찍고 tap 갱신 단계에서 에러로 멈춘다.
