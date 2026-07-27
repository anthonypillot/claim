# Claim API

Claim API exposes a read-only JSON HTTP surface for currently free game giveaways. It aggregates
offers from Epic Games, Amazon Prime Gaming, GOG, and Steam into a normalized response. Giveaway
requests maintain a read-through cache in Postgres; clients cannot mutate it directly. GamerPower is
planned next.

Giveaway data is cached in Postgres through Drizzle ORM, keeping repeat reads fast while preserving
each store's history.

## API

Start the server, then open the interactive API documentation at
[`http://localhost:3000/openapi`](http://localhost:3000/openapi). The raw OpenAPI document is at
[`/openapi/json`](http://localhost:3000/openapi/json).

| Endpoint                      | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `GET /`                       | API name, version, and description                             |
| `GET /health`                 | Process liveness; does not require Postgres                    |
| `GET /ready`                  | Database readiness; returns `503` when Postgres is unavailable |
| `GET /giveaways`              | Current giveaways across all stores                            |
| `GET /giveaways/epic-games`   | Current Epic Games giveaways                                   |
| `GET /giveaways/prime-gaming` | Current Prime Gaming full-game giveaways                       |
| `GET /giveaways/gog`          | Current GOG giveaways                                          |
| `GET /giveaways/steam`        | Current Steam time-limited 100%-off giveaways                  |

All giveaway endpoints accept optional `locale` and `country` query parameters. Defaults are
`en-US` and `US`; supported values are `en-US`/`fr-FR` and `US`/`FR`. Inputs are case-insensitive
and canonicalized before they reach an upstream or become cache keys.

The aggregate endpoint returns currently available offers tagged with their store. If one upstream
fails while other stores have usable data, it still returns HTTP 200 and lists that store in
`errors`.

## Local development

CI and the production image use the latest Bun 1.3 patch release. You also need Postgres; Docker is
the quickest way to
run it locally. From the repository root:

```bash
bun install
cp packages/api/.env.example packages/api/.env

docker run --detach --rm --name claim-postgres \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=claim \
  --publish 5432:5432 \
  postgres:18-alpine
until docker exec claim-postgres pg_isready --username=postgres --dbname=claim; do sleep 1; done

bun run --cwd packages/api db:migrate
bun run dev
```

The example environment file already matches the local Postgres command. In another terminal:

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/giveaways?locale=fr-FR&country=FR"
```

## Configuration

| Variable         | Purpose                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | Postgres connection URL. Required by giveaway routes, `/ready`, and migration commands.  |
| `PUBLIC_API_URL` | Public API origin advertised by OpenAPI. Required in production.                         |
| `PORT`           | HTTP port. Defaults to `3000`.                                                           |
| `LOG_LEVEL`      | Pino log level. Defaults to `debug` in development and `info` in production.             |
| `NODE_ENV`       | Use `production` for production logging defaults; `bun run start` sets it automatically. |

`PUBLIC_API_URL` must be an HTTP(S) origin without a path, query, or fragment. It defaults to the
local API origin outside production. CORS is unrestricted because the API is public and read-only.

`/health` and application construction do not need a database connection, which allows the
container liveness probe to remain independent of Postgres.

## Database and cache

`GET /giveaways*` is a read-through cache. Each `(store, locale, country)` scope is fresh for
24 hours. A stale scope fetches live data, replaces its active snapshot transactionally, and then
serves the cached result. Empty results are cached, failed stores remain stale, and inactive rows
retain first- and last-seen history. Upstream HTML and JSON responses are limited to 5 MiB before
parsing. External giveaway and artwork URLs are canonicalized, restricted to credential-free
HTTP(S), and stored as `null` when malformed or unsafe.

The schema lives in `src/db/schema.ts`; generated SQL migrations live in `drizzle/`.

Run migration commands from the repository root with the API package as the working directory:

```bash
# After changing the schema, review and commit the generated migration.
bun run --cwd packages/api db:generate

# Apply committed migrations from source.
bun run --cwd packages/api db:migrate
```

The production bundle deliberately excludes migration SQL and development-only tools. Apply
migrations from source before deploying a built image.

## Development commands

From this package directory, package-local scripts are available:

```bash
bun run dev
bun test
bun run lint
bun run format:check
bun run typecheck
bun run build
bun run build:production
bun run start
```

`bun run start` runs the built API with `NODE_ENV=production`.

Run one suite or filter by test name from `packages/api`:

```bash
bun test src/modules/giveaways/index.test.ts
bun test --test-name-pattern "returns 502"
```

Route and repository tests apply committed migrations to an in-memory PGlite database; they do not
need an external Postgres instance.

## Docker

Build with the repository root as the Docker context so Bun can install the complete workspace:

```bash
docker build --pull --file packages/api/Dockerfile --tag claim-api .
docker run --rm --publish 3000:3000 \
  --env DATABASE_URL="postgres://postgres:postgres@database-host:5432/claim" \
  --env PUBLIC_API_URL="https://api.claim.anthonypillot.com" \
  claim-api
```

Use a database hostname reachable from the container, such as a service name on a shared Docker
network. Apply migrations from source before starting the image. The image exposes port `3000` and
uses `/health` as its Docker health check.

## Published images

Stable releases publish multi-architecture images to
[`ghcr.io/anthonypillot/claim-api`](https://ghcr.io/anthonypillot/claim-api). Each release receives
`<major>.<minor>.<patch>`, `<major>.<minor>`, `<major>`, and `latest` tags.

```bash
docker pull ghcr.io/anthonypillot/claim-api:latest
```
