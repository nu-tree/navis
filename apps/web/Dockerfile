# apps/web — 빌드 컨텍스트는 레포 루트다.
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
#
# Cloud Run 서비스의 ingress 컨테이너다. 외부 요청은 전부 여기로 들어오고,
# server 는 같은 서비스의 사이드카(localhost:4000)로 부른다.

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@navis/web..."
# NEXT_PUBLIC_* 은 **빌드 시점에** 번들로 박힌다 — 런타임 환경변수로는 늦다.
# 둘 다 공개를 전제로 한 값이다(anon 키). 빠뜨리면 로그인이 통째로 꺼지므로
# 빈 값이면 빌드를 멈춘다(tasks.md "배포 환경에 두 값을 반드시 넣어야 한다").
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  || (echo "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없다 — 로그인이 꺼진 채 배포된다" >&2; exit 1)
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @navis/web build

FROM node:22-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
WORKDIR /app
# standalone 은 모노레포 구조를 그대로 유지해 apps/web/server.js 에 놓인다.
# static · public 은 standalone 에 포함되지 않으므로 따로 복사한다.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
# PORT 는 Cloud Run 이 넣는다(기본 8080).
CMD ["node", "apps/web/server.js"]
