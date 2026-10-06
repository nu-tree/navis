#!/usr/bin/env bash
# navis 배포 — 빌드 · 푸시 · Cloud Run 반영을 한 번에.
#
#   ./deploy/deploy.sh
#
# 최초 1회 준비는 deploy/README.md. 마이그레이션은 하지 않는다 — 스키마가 바뀌었으면
# 배포 전에 `DATABASE_URL=<운영> pnpm db:migrate` 를 먼저 돌린다(헌장).
set -euo pipefail

cd "$(dirname "$0")/.."

# NEXT_PUBLIC_* 는 빌드 시점에 번들로 박히므로 빌드 인자로 넘긴다.
# 공개를 전제로 한 값이지만 레포에는 두지 않는다 — deploy/deploy.env(gitignore).
if [[ -f deploy/deploy.env ]]; then
  set -a
  # shellcheck disable=SC1091
  . deploy/deploy.env
  set +a
fi

: "${GCP_PROJECT:?deploy/deploy.env 에 GCP_PROJECT 를 채울 것}"
: "${NEXT_PUBLIC_SUPABASE_URL:?deploy/deploy.env 에 NEXT_PUBLIC_SUPABASE_URL 을 채울 것}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?deploy/deploy.env 에 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 채울 것}"
REGION="${GCP_REGION:-asia-southeast1}"

gcloud builds submit \
  --project="$GCP_PROJECT" \
  --region="$REGION" \
  --config=deploy/cloudbuild.yaml \
  --substitutions="_REGION=$REGION,_NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL,_NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  .

gcloud run services describe navis \
  --project="$GCP_PROJECT" --region="$REGION" --format='value(status.url)'
