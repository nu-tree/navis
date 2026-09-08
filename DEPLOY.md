# 배포 (Vercel)

Vercel 프로젝트 **1개**로 배포한다. 루트 `vercel.json` 이 `apps/web` 을 빌드한다.

## 1. Vercel 프로젝트 만들기

레포를 연결하고 **Root Directory 는 레포 루트 그대로** 둔다(모노레포 루트에서
`pnpm --filter web build` 를 돌린다 — `vercel.json` 에 설정돼 있다).

## 2. 환경변수

Vercel 프로젝트 Settings → Environment Variables 에 넣는다.

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Supabase Postgres. **반드시 풀러(transaction mode, 포트 6543) URL** — 직결(5432)은 인스턴스마다 커넥션을 잡아 금방 고갈된다 |
| `VOYAGE_API_KEY` | ✅ | 임베딩(기억 벡터 검색) |
| `CLAUDE_CODE_OAUTH_TOKEN` | ✅ | `claude setup-token` 으로 발급한 구독 토큰 |
| `APP_API_TOKEN` | ✅ | 앱/웹이 `/api/*` 를 부를 때의 Bearer 토큰. `openssl rand -hex 32` |
| `NAMORY_TOKEN` | ✅ | 공개 `/api/mcp` 인증(Claude 커스텀 커넥터용). 위와 다른 값 |
| `NAVIS_PUBLIC_URL` | 커넥터 OAuth 쓰면 | 예: `https://navis.vercel.app`. 미설정 시 운영에서 OAuth 시작을 거부한다(Host 헤더 주입 방어) |
| `SYSTEM_PROMPT` | — | 봇 성격 초기값. DB(`settings.system_prompt`)가 1순위이고 이건 폴백 |
| `NTFY_TOPIC` | — | 폰 푸시. 추측 불가한 랜덤 문자열 |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | — | 셋 다 있어야 캘린더 활성 |

## 3. 마이그레이션

첫 배포 전에 로컬에서 한 번 돌린다(서버리스 함수는 마이그레이션을 자동 실행하지 않는다).

```bash
DATABASE_URL='<풀러 URL>' pnpm db:migrate
```

## 4. 스케줄러 (중요)

**Vercel Cron 을 쓰지 않는다.** Hobby 플랜은 "하루 1회, ±59분 오차" 제한이 있어
30분 단위 캘린더 확인이나 사용자 정의 크론을 걸 수 없다. 대신 GitHub Actions 가
5분마다 틱 엔드포인트를 친다 — `.github/workflows/scheduler-tick.yml`.

레포 Settings → Secrets and variables → Actions 에 등록:

| Secret | 값 |
| --- | --- |
| `NAVIS_URL` | 배포된 URL (예: `https://navis.vercel.app`) |
| `NAVIS_TOKEN` | 위 `APP_API_TOKEN` 과 같은 값 |

등록 후 Actions 탭에서 workflow_dispatch 로 한 번 수동 실행해 200 이 오는지 확인한다.

> node-cron 은 쓸 수 없다. 서버리스 함수는 응답을 보내면 얼려지므로 등록된 타이머가
> 영영 발화하지 않는다. 자세한 설계는 `packages/navis/src/scheduler/tick.ts` 주석.

## 5. 확인

```bash
curl https://<배포URL>/api/health                      # {"ok":true}
curl -H "Authorization: Bearer $APP_API_TOKEN" \
     https://<배포URL>/api/reports                      # {"reports":[...]}
```

## 6. 앱 연결

`packages/app/.env`:

```
EXPO_PUBLIC_NAVIS_URL=https://<배포URL>
EXPO_PUBLIC_NAVIS_TOKEN=<APP_API_TOKEN 과 동일>
```

## 알아둘 제약 (Hobby)

- **함수 실행시간 300초 고정 상한** (Pro 는 800초). 에이전트 턴이 이걸 넘으면 504 로
  끊긴다. 앱 턴은 `conversationId`+스냅샷을 보내므로 서버가 응답을 대화에 써넣고 폰으로
  푸시하는 경로(백그라운드 완주)로 답을 회수한다 — 다만 함수가 죽으면 그 경로도 못 탄다.
- **크론 해상도 = Actions 트리거 간격(5분)**. Actions cron 은 러너 부하에 따라 수분
  지연될 수 있어 정시 발동은 보장되지 않는다. 밀린 발동은 다음 틱이 한 번 잡아준다.
- **대화 `resume` 불가**. Agent SDK 의 세션 파일은 인스턴스 로컬 디스크에 있고 요청
  간에 사라진다. 맥락은 namory 에 저장된 이력을 매 턴 재생해 잇는다.
