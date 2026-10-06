# 배포 — Google Cloud Run

Cloud Run 서비스 **하나**(`navis`)에 컨테이너 두 개를 올린다(헌장 스택 절).

```
인터넷 ──▶ web (Next, :8080, ingress) ──localhost:4000──▶ server (Hono, 사이드카)
                                                          └─▶ Supabase Postgres · Voyage · Claude
```

- server 는 외부에 열리지 않는다. `API_TOKEN` 이 오가는 BFF → server 구간이 인스턴스 안에서 끝난다.
- 최대 인스턴스 1, 최소 0. 안 쓰면 0 으로 내려가 과금되지 않고, 첫 요청에 콜드 스타트가 있다.
- 비밀값은 Secret Manager 에 두고 필요한 컨테이너에만 주입한다(`service.yaml`).

## 매 배포

```bash
./deploy/deploy.sh
```

Cloud Build 가 두 이미지를 linux/amd64 로 빌드 · 푸시하고 `service.yaml` 로 서비스를 갈아끼운다.
끝나면 서비스 URL 을 출력한다.

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
printf '%s' '<claude setup-token 값>'  | gcloud secrets create navis-claude-oauth-token --data-file=-

# 4. 서비스 런타임 계정 — 비밀값 읽기만
gcloud iam service-accounts create navis-run
for s in navis-api-token navis-database-url navis-voyage-api-key navis-claude-oauth-token; do
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

# 6. 배포 설정
cp deploy/deploy.env.example deploy/deploy.env   # GCP_PROJECT · Supabase 공개 값 채우기
./deploy/deploy.sh
```

마지막으로 Supabase 대시보드 → Authentication → URL Configuration 의 **Site URL** 에
서비스 URL 을 넣는다.

## 무료 범위

요청 기반 과금이라 **요청을 처리하는 동안만** 계산된다(무료: 월 180,000 vCPU-초,
360,000 GiB-초, 요청 200만). 컨테이너 둘이 1 vCPU 씩이라 응답 중인 시간 기준 월 약 25시간이
무료다. 혼자 쓰는 양이면 넉넉하지만, 혹시 모르니 결제 → 예산에서 알림을 걸어둔다.

Secret Manager(활성 버전 6개 무료 — 4개 사용), Artifact Registry(0.5GB — 정리 정책),
Cloud Build(빌드 시간 무료 한도) 모두 이 범위 안에 있다.
