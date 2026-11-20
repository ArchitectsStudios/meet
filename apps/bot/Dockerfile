# Build from the repo root:  docker build -f apps/bot/Dockerfile .
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
COPY apps/bot apps/bot
# The bundle includes @meet/shared; deploy copies only the runtime dependencies.
RUN pnpm --filter @meet/bot build \
 && pnpm --filter @meet/bot deploy --prod --legacy /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /repo/apps/bot/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "--enable-source-maps", "dist/index.cjs"]
