# Build from the repo root:  docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# Build identity from CI (scripts/compute-build-string.mjs). Pages rendered at build time read it too.
ARG MEET_BUILD_STRING="untracked version"
ARG MEET_BUILD_BRANCH=""
ARG MEET_BUILD_COMMIT=""
ARG MEET_BUILD_TIME=""
ENV MEET_BUILD_STRING=${MEET_BUILD_STRING} \
    MEET_BUILD_BRANCH=${MEET_BUILD_BRANCH} \
    MEET_BUILD_COMMIT=${MEET_BUILD_COMMIT} \
    MEET_BUILD_TIME=${MEET_BUILD_TIME}
RUN pnpm --filter @meet/web build

FROM node:22-alpine AS runtime
ARG MEET_BUILD_STRING="untracked version"
ARG MEET_BUILD_BRANCH=""
ARG MEET_BUILD_COMMIT=""
ARG MEET_BUILD_TIME=""
ENV MEET_BUILD_STRING=${MEET_BUILD_STRING} \
    MEET_BUILD_BRANCH=${MEET_BUILD_BRANCH} \
    MEET_BUILD_COMMIT=${MEET_BUILD_COMMIT} \
    MEET_BUILD_TIME=${MEET_BUILD_TIME}
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
