# 배포 — Google Cloud Run

Cloud Run 서비스 **하나**(`navis`)에 컨테이너 두 개를 올린다(헌장 스택 절).

```
인터넷 ──▶ web (Next, :8080, ingress) ──localhost:4000──▶ server (Hono, 사이드카)
                                                          └─▶ Supabase Postgres · Voyage · Claude
```

- server 는 외부에 열리지 않는다. `API_TOKEN` 이 오가는 BFF → server 구간이 인스턴스 안에서 끝난다.
- 최대 인스턴스 1, 최소 0. 안 쓰면 0 으로 내려가 과금되지 않고, 첫 요청에 콜드 스타트가 있다.
- 비밀값은 Secret Manager 에 두고 필요한 컨테이너에만 주입한다(`service.yaml`).

## 매 배포 — `main` 에 push 하면 끝

GitHub `main` 에 push 하면 Cloud Build 트리거(`rmgpgab-navis-…`, 전역)가 `deploy/cloudbuild.yaml` 로
두 이미지를 linux/amd64 로 빌드 · 푸시하고 `service.yaml` 로 서비스를 갈아끼운다. 진행 상황은
콘솔의 Cloud Build → 기록, 또는 `gcloud builds list --project=navis-497807 --limit=3`.

빌드에 필요한 Supabase 공개 값(`_NEXT_PUBLIC_SUPABASE_URL` · `_NEXT_PUBLIC_SUPABASE_ANON_KEY`)은
**트리거의 대체 변수**에 들어 있다 — 레포에는 두지 않는다. 바꾸려면 트리거 설정을 고친다.

**스키마가 바뀌었으면 배포 전에** 운영 DB 에 마이그레이션을 먼저 적용한다. 부팅 시 자동
마이그레이션은 없다.

```bash
DATABASE_URL='<운영 Supabase URL>' pnpm db:migrate
```

## 최초 1회 준비

`gcloud` CLI 설치 후(`brew install --cask google-cloud-sdk`), 결제 계정이 연결된 프로젝트에서:

```bash
PROJECT=<프로젝트 ID>
REGION=asia-southeast1          # Supabase 가 ap-southeast-1(싱가포르)
gcloud auth login
gcloud config set project $PROJECT

# 1. API
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

# 2. 이미지 저장소 + 정리 정책(무료 저장 0.5GB — 최신 2개만 남긴다)
gcloud artifacts repositories create navis --repository-format=docker --location=$REGION
cat > /tmp/navis-cleanup.json <<'EOF'
[{"name":"keep-latest","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":2}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"any"}}]
EOF
gcloud artifacts repositories set-cleanup-policies navis --location=$REGION \
  --policy=/tmp/navis-cleanup.json --no-dry-run

# 3. 비밀값 (값은 apps/server/.env.example 설명 참고)
#    navis-api-token 은 `openssl rand -hex 32` 로 새로 만든다 — web · server 가 같은 값을 쓴다.
#    navis-database-url 은 Supabase 풀러(transaction mode, 6543) URL.
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create navis-api-token --data-file=-
printf '%s' '<Supabase 풀러 URL>'      | gcloud secrets create navis-database-url --data-file=-
printf '%s' '<Voyage 키>'              | gcloud secrets create navis-voyage-api-key --data-file=-
#    navis-settings-key 는 Claude 토큰을 DB 에 암호화해 둘 때 쓰는 키다. 바꾸면 저장된 토큰을 못 푼다.
printf '%s' "$(openssl rand -base64 32)" | gcloud secrets create navis-settings-key --data-file=-

# 4. 서비스 런타임 계정 — 비밀값 읽기만
gcloud iam service-accounts create navis-run
for s in navis-api-token navis-database-url navis-voyage-api-key navis-settings-key; do
  gcloud secrets add-iam-policy-binding $s \
    --member=serviceAccount:navis-run@$PROJECT.iam.gserviceaccount.com \
    --role=roles/secretmanager.secretAccessor
done

# 5. Cloud Build 가 배포할 수 있게 — 빌드 계정(기본: Compute 기본 계정)에 권한
NUM=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
BUILD_SA=$NUM-compute@developer.gserviceaccount.com
for r in roles/run.admin roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$BUILD_SA --role=$r
done
gcloud iam service-accounts add-iam-policy-binding navis-run@$PROJECT.iam.gserviceaccount.com \
  --member=serviceAccount:$BUILD_SA --role=roles/iam.serviceAccountUser

# 6. 배포 트리거 — Cloud Build → 트리거 → GitHub 저장소 연결, 브랜치 ^main$,
#    구성 파일 deploy/cloudbuild.yaml, 대체 변수에 _NEXT_PUBLIC_SUPABASE_URL ·
#    _NEXT_PUBLIC_SUPABASE_ANON_KEY 를 채운다. 그 뒤로는 main 에 push 하면 배포된다.

# 7. ★ 배포 직후: 웹의 설정 화면에서 Claude 토큰을 등록한다(`claude setup-token` 으로 발급).
#    등록하기 전에는 대화가 "설정에서 토큰을 등록하라"는 안내로 끝난다.
```

마지막으로 Supabase 대시보드 → Authentication → URL Configuration 의 **Site URL** 에
서비스 URL 을 넣는다.

## 무료 범위

요청 기반 과금이라 **요청을 처리하는 동안만** 계산된다(무료: 월 180,000 vCPU-초,
360,000 GiB-초, 요청 200만). 컨테이너 둘이 1 vCPU 씩이라 응답 중인 시간 기준 월 약 25시간이
무료다. 혼자 쓰는 양이면 넉넉하지만, 혹시 모르니 결제 → 예산에서 알림을 걸어둔다.

Secret Manager(활성 버전 6개 무료 — 4개 사용), Artifact Registry(0.5GB — 정리 정책),
Cloud Build(빌드 시간 무료 한도) 모두 이 범위 안에 있다.

## 환경변수 토큰 → 설정 화면 전환 (US5, 한 번만)

예전 배포는 Claude 토큰을 `navis-claude-oauth-token` 비밀값으로 넣었다. 지금은 설정 화면에서
등록한다. 이미 배포된 서비스를 옮기는 순서:

```bash
# 1) 암호화 키를 만들고 런타임 계정에 읽기 권한
printf '%s' "$(openssl rand -base64 32)" | gcloud secrets create navis-settings-key --data-file=-
gcloud secrets add-iam-policy-binding navis-settings-key \
  --member=serviceAccount:navis-run@$PROJECT.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# 2) 배포 — main 에 push. service.yaml 이 키를 넣고 토큰 비밀값은 더 넣지 않는다
```

3. 웹의 **설정** 화면에서 토큰을 등록한다. 대화가 되는지 확인한다.
4. 정상이면 예전 비밀값을 지운다: `gcloud secrets delete navis-claude-oauth-token`

배포(2)와 등록(3) 사이에는 대화가 되지 않는다 — 몇 분이면 끝나지만 순서를 지킨다.

## 다중 사용자 전환 (specs/002) — 2026-10-08 완료

운영 DB 의 기존 기억 · 대화 · 설정을 관리자(`navis-owner-id`)에게 옮기고 0008 · 0009 를 적용한 뒤
배포했다. 한 번 쓰고 끝나는 도구(전환 스크립트 · 채우기 · 부분 마이그레이션)는 지웠다 — 다시
필요하면 커밋 `ea7d4e0` 의 `packages/db/src/assign-owner.ts` 를 본다.

회원 추가: Supabase 대시보드 → Users 에서 초대 · 생성 → 회원이 로그인 → 설정 화면에서 자기 Claude
토큰 등록. 새로 만드는 빈 DB 는 평소처럼 `pnpm db:migrate` 한 번이면 된다.

## 웹 푸시 켜기 (한 번)

창을 닫아도 답 도착 알림이 오게 한다. 공개 키는 `service.yaml` 에 들어 있고, 개인 키만 비밀값으로 둔다.
키 한 쌍을 새로 만들면 `service.yaml` 의 `NAVIS_VAPID_PUBLIC_KEY` 도 함께 바꾼다.

```bash
# 1) 개인 키 비밀값 + 런타임 계정 읽기 권한
printf '%s' '<VAPID 개인 키>' | gcloud secrets create navis-vapid-private-key --data-file=-
gcloud secrets add-iam-policy-binding navis-vapid-private-key \
  --member=serviceAccount:navis-run@$PROJECT.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# 2) 운영 DB 에 0010(push_subscriptions) 적용 — 배포보다 먼저
DATABASE_URL='<Supabase 풀러 URL>' pnpm db:migrate

# 3) 배포 — main 에 push
```

비밀값이 없으면 배포가 실패한다(Cloud Run 이 secretKeyRef 를 못 찾는다). 0010 없이 배포하면 대화는 되고
알림 켜기만 실패한다.

## 약속 켜기 — 먼저 말 거는 나비스 (한 번, specs/003)

정해진 때에 나비스가 먼저 말을 걸게 한다. 인스턴스가 0 으로 내려가므로 프로세스 안의 타이머로는 깨울 수
없다 — **Cloud Scheduler 작업 하나**가 1분마다 `/api/internal/tick` 을 부른다. tick 은 할 일이 없으면 DB
조회 한 번으로 끝나고 모델을 부르지 않는다. **순서가 중요하다.**

```bash
# 1) tick 토큰 비밀값 + 런타임 계정 읽기 권한 (2026-10-14 생성 완료)
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create navis-tick-token --data-file=-
gcloud secrets add-iam-policy-binding navis-tick-token \
  --member=serviceAccount:navis-run@$PROJECT.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# 2) 운영 DB 에 0011(messages · promises · promise_runs) 적용 — 배포보다 먼저.
#    기존 대화(jsonb)를 messages 표로 옮긴다. conversations.messages 열은 아직 지우지 않는다.
DATABASE_URL='<Supabase 풀러 URL>' pnpm db:migrate

# 3) 배포 — main 에 push

# 4) 따라잡기: 2) 와 3) 사이에 옛 코드가 jsonb 에 쓴 메시지를 옮긴다(중복 없음).
#    packages/db/migrations/0011_messages_and_promises.sql 끝의 INSERT INTO "messages" … 문을 그대로 실행.

# 5) 대조: 방별 jsonb 메시지 수 = messages 표의 수 (specs/003 quickstart S0)
#    select count(*) from conversations c
#     where jsonb_array_length(c.messages) <> (select count(*) from messages m where m.conversation_id = c.id);
#    → 0 이어야 한다.

# 6) Scheduler 작업 (API 를 처음 켠다)
gcloud services enable cloudscheduler.googleapis.com
gcloud scheduler jobs create http navis-tick \
  --location=$REGION \
  --schedule="* * * * *" \
  --uri="https://navis-2gk6vbz4kq-as.a.run.app/api/internal/tick" \
  --http-method=POST \
  --headers="Authorization=Bearer $(gcloud secrets versions access latest --secret=navis-tick-token)" \
  --attempt-deadline=1800s \
  --max-retry-attempts=0
```

- **간격**: 기본 1분. 비용이 걱정되면 `gcloud scheduler jobs update http navis-tick --location=$REGION
  --schedule="*/5 * * * *"` — 약속이 최대 5분 늦어질 뿐이다.
- **attempt-deadline 30분 · 재시도 없음**: tick 은 약속 실행이 끝날 때까지 응답을 붙든다(Cloud Run 은 응답
  뒤 CPU 를 거의 주지 않는다). 실패한 회차는 15분 임대가 끝나면 다음 tick 이 다시 집는다.
- **끄기**: `gcloud scheduler jobs pause navis-tick --location=$REGION` — 대화는 그대로 되고 약속만 멈춘다.
- **토큰을 바꾸면** 비밀값 새 버전을 만들고 재배포한 뒤, Scheduler 작업의 헤더도 같은 명령(`update http …
  --update-headers=…`)으로 바꾼다.
- 대조가 끝나면 `conversations.messages` 열을 지우는 0013 을 만들어 적용한다(tasks T013 — 0012 는 전하기의
  `relays` 표가 먼저 썼다). 그 전에 만들면
  `db:migrate` 한 번에 0011 과 열 삭제가 함께 적용돼 대조할 틈이 없다.

## 전하기 켜기 — 관리자가 회원에게 말 걸기 (한 번, specs/004)

새 비밀값 · 환경변수 · Scheduler 작업은 없다. 약속과 같은 tick 이 전하기도 집는다. 배포 전에 두 가지만 한다.

```bash
# 1) server 의 DB 역할이 회원 목록(auth.users)을 읽을 수 있는지 — 받는 사람 고르기에 쓴다
psql '<Supabase 풀러 URL>' -c 'select count(*) from auth.users;'

# 2) relays 표(0012)
DATABASE_URL='<Supabase 풀러 URL>' pnpm db:migrate
```

- 1) 이 권한 오류면 **배포하지 않는다**. 회원 목록을 다른 길로 얻어야 한다(specs/004 research R4-b).
- 전하기 턴은 **관리자(`NAVIS_OWNER_ID`)의 Claude 토큰**으로 돈다. 관리자가 설정에서 토큰을 등록해 두어야 보낼 수 있다.
- 확인: 관리자로 ⋯ → 말 걸기 → 테스트 회원에게 보내기 → 1–2분 안에 그 회원 "나비스" 방에 도착(specs/004 quickstart M1–M12).

## 메일 템플릿 — 초대 · 비밀번호 재설정 (Supabase 대시보드, 한 번)

이 앱은 세션을 쿠키로 둔다(`@supabase/ssr`). 기본 템플릿의 `{{ .ConfirmationURL }}` 은 로그인 정보를 주소의
`#` 뒤에 실어 보내서 서버가 받을 수 없다. 링크가 `/auth/confirm` 으로 오도록 템플릿을 바꾼다.

**Authentication → URL Configuration**

- Site URL: `https://navis-2gk6vbz4kq-as.a.run.app` (커스텀 도메인을 쓰면 그 주소)
- Redirect URLs: `https://navis-2gk6vbz4kq-as.a.run.app/**` (로컬도 쓰면 `http://localhost:3000/**`)

**Authentication → Emails → Templates**

Invite user — 본문의 링크를 이것으로:

```html
<h2>나비스에 초대됐어요</h2>
<p>아래 링크에서 비밀번호를 정하면 바로 쓸 수 있어요.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password">초대 수락하고 비밀번호 정하기</a></p>
```

Reset password:

```html
<h2>나비스 비밀번호 다시 정하기</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/set-password">새 비밀번호 정하기</a></p>
<p>요청하지 않았다면 이 메일은 무시해도 돼요.</p>
```

흐름: 메일 링크 → `/auth/confirm`(서버가 토큰 검증 · 세션 쿠키) → `/auth/set-password`(새 비밀번호) → 대화.
링크가 만료됐거나 이미 쓴 것이면 `/login?error=link` 로 돌아가 안내가 보인다.

**메일 발송(SMTP)** — Supabase 기본 발송은 시간당 몇 통으로 제한되고, 팀원으로 등록된 주소에만 보내는
제약이 있다. 다른 사람을 초대하려면 Authentication → Emails → SMTP Settings 에 자체 SMTP(Resend · Gmail 등)를
넣는다.
