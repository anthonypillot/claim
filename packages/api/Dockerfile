# syntax=docker/dockerfile:1
# Build with repository-root context: docker build --pull --file packages/api/Dockerfile --tag claim-api .

FROM oven/bun:1.3-slim AS base

WORKDIR /app

FROM base AS deps

COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN bun install --frozen-lockfile

FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY . .

RUN bun run --cwd /app/packages/api build:production

FROM base AS runtime

ENV NODE_ENV=production

# The entrypoint runs from the API package while retaining the repository-level manifest at ../..
# for runtime code that resolves package metadata relative to the working directory.
WORKDIR /app/packages/api

COPY --chown=bun:bun package.json /app/package.json
COPY --chown=bun:bun packages/api/package.json ./package.json
COPY --chown=bun:bun --from=build /app/packages/api/build ./build

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["bun", "-e", "const port = process.env.PORT ?? '3000'; const response = await fetch(`http://127.0.0.1:${port}/health`); process.exit(response.ok ? 0 : 1);"]

CMD ["bun", "./build/index.js"]
