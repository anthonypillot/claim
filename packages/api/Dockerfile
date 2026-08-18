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

FROM oven/bun:1.3-distroless AS runtime

ARG APP_VERSION
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION}

# The entrypoint runs from the API package while retaining the repository-level manifest at ../..
# for runtime code that resolves package metadata relative to the working directory.
WORKDIR /app/packages/api

COPY --chown=65532:65532 package.json /app/package.json
COPY --chown=65532:65532 packages/api/package.json ./package.json
COPY --chown=65532:65532 --from=build /app/packages/api/build ./build

USER 65532:65532

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["/usr/local/bin/bun", "-e", "const port = process.env.PORT ?? '3000'; const response = await fetch(`http://127.0.0.1:${port}/health`); process.exit(response.ok ? 0 : 1);"]

CMD ["./build/index.js"]
