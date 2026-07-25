# syntax=docker/dockerfile:1
# Build with repository-root context: docker build --pull --file packages/web/Dockerfile --tag claim-web .

FROM oven/bun:1.3-slim AS base

WORKDIR /app

FROM base AS deps

COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN bun install --frozen-lockfile

FROM base AS prod-deps

COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN bun install --frozen-lockfile --production --filter web

FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY . .

WORKDIR /app/packages/web

RUN bun run build

FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime

ENV NODE_ENV=production

WORKDIR /app/packages/web

COPY --chown=65532:65532 packages/web/package.json ./package.json
COPY --chown=65532:65532 --from=prod-deps /app/node_modules /app/node_modules
COPY --chown=65532:65532 --from=prod-deps /app/packages/web/node_modules ./node_modules
COPY --chown=65532:65532 --from=build /app/packages/web/build ./build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["/nodejs/bin/node", "-e", "const port = process.env.PORT ?? '3000'; fetch(`http://127.0.0.1:${port}/health`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));"]

CMD ["build/index.js"]
