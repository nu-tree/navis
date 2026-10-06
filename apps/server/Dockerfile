# apps/server — 빌드 컨텍스트는 레포 루트다.
#   docker build -f apps/server/Dockerfile .
#
# Cloud Run 서비스에서 web 의 사이드카로 돈다(deploy/service.yaml).
# 외부에 열리지 않고 localhost:4000 으로만 web BFF 의 요청을 받는다.

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@navis/server..."
RUN pnpm --filter @navis/server build
# 운영 의존성만 담은 독립 디렉터리를 만든다. 번들(dist/)이 외부로 남긴 것은
# Agent SDK 하나다 — SDK 가 자기 패키지 안의 플랫폼별 claude 바이너리를 서브프로세스로
# 띄우기 때문에 번들에 넣을 수 없다. 그래서 **이 리눅스 이미지 안에서** 설치해야 한다.
RUN pnpm --filter @navis/server deploy --prod --legacy /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
# Agent SDK 가 ~/.claude 에 세션 파일을 쓴다. node 사용자의 HOME 은 쓰기 가능하다.
USER node
EXPOSE 4000
CMD ["node", "--enable-source-maps", "dist/index.js"]
