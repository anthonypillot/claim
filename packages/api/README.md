# Claim API

Claim API exposes a read-only JSON HTTP surface for currently free game giveaways. It aggregates
offers from Epic Games, Amazon Prime Gaming, GOG, and Steam into a normalized response. Giveaway
requests maintain a read-through cache in Postgres; clients cannot mutate it directly. GamerPower is
planned next.

Optional Discord alerts add a signed HTTP interactions endpoint and in-process monitoring. The
giveaway endpoints remain read-only; administrators manage alerts inside Discord, not through a
public subscription-management API.

Giveaway data is cached in Postgres through Drizzle ORM, keeping repeat reads fast while preserving
each store's history.

## API

Start the server, then open the interactive API documentation at
[`http://localhost:3000/openapi`](http://localhost:3000/openapi). The raw OpenAPI document is at
[`/openapi/json`](http://localhost:3000/openapi/json). It targets OpenAPI 3.1 and is validated by the
API test suite in CI.

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
cannot be refreshed, its last successful snapshot is served when available and the store is listed
in `errors`. The endpoint returns 502 only when no store has ever completed a successful refresh.

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

| Variable                      | Purpose                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | Postgres connection URL. Required by giveaway routes, `/ready`, and migration commands.  |
| `PUBLIC_API_URL`              | Public API origin advertised by OpenAPI. Required in production.                         |
| `PORT`                        | HTTP port. Defaults to `3000`.                                                           |
| `LOG_LEVEL`                   | Pino log level. Defaults to `debug` in development and `info` in production.             |
| `NODE_ENV`                    | Use `production` for production logging defaults; `bun run start` sets it automatically. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector base URL. Setting it enables OpenTelemetry server traces.                 |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | OTLP transport. Claim deployments use `http/protobuf`.                                   |
| `OTEL_LOGS_EXPORTER`          | Set to `none`; Pino logs remain on stdout for cluster collection.                        |
| `OTEL_METRICS_EXPORTER`       | Set to `none`; SigNoz derives APM metrics from traces.                                   |
| `OTEL_RESOURCE_ATTRIBUTES`    | Comma-separated resource metadata such as namespace and deployment environment.          |

`PUBLIC_API_URL` must be an HTTP(S) origin without a path, query, or fragment. It defaults to the
local API origin outside production. CORS is unrestricted because the API is public and read-only.

`/health` and application construction do not need a database connection, which allows the
container liveness probe to remain independent of Postgres.

When an OTLP endpoint is configured, the API reports Elysia server spans as the `claim-api` service.
`/health` and `/ready` are excluded to keep Kubernetes probe traffic out of APM.

## Database and cache

`GET /giveaways*` uses a request-driven read-through cache. Each `(store, locale, country)` scope is
fresh until its earliest giveaway expires or its 24-hour maximum TTL ends. The next request refreshes
only stale scopes. Empty results remain cached for up to 24 hours, failures preserve usable cached
giveaways, and coordinated refreshes prevent duplicate upstream calls.

When Discord is enabled, active subscriptions independently require hourly refreshes and initial
baselines. Successful monitored refreshes, including public reads, save occurrence evidence and
eligible alert work in the same transaction as the snapshot. Unsubscribed scopes retain their
existing 24-hour behavior.

See [`docs/features/giveaways-flow.md`](../../docs/features/giveaways-flow.md) for the cache cases, failure behavior, and
upstream call impact.

The schema lives in `src/db/schema.ts`; generated SQL migrations live in `drizzle/`.

Run migration commands from the repository root with the API package as the working directory:

```bash
# Preview the schema changes needed by the target database without applying them.
bun run --cwd packages/api db:diff

# After changing the schema, review and commit the generated migration.
bun run --cwd packages/api db:generate

# Apply committed migrations from source.
bun run --cwd packages/api db:migrate
```

The production bundle deliberately excludes migration SQL and development-only tools. Apply
migrations from source before deploying a built image.

## Discord alerts

See the [feature specification](../../docs/features/discord-notifications.md) and
[operations guide](../../docs/features/discord-operations.md). The feature defaults to off. Set
`DISCORD_ENABLED=true`, `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`,
`PUBLIC_WEB_URL`, and `DATABASE_URL` to enable it. The web origin must be HTTPS in production.
Keys are checked lazily at runtime bootstrap; application composition and `/health` remain
database-independent. Bot authorization is checked by Discord; an invalid token pauses delivery
globally until a corrected token is configured and the API restarted.

| Variable                           | Default | Allowed seconds | Purpose                         |
| ---------------------------------- | ------- | --------------- | ------------------------------- |
| `DISCORD_MONITOR_INTERVAL_SECONDS` | `3600`  | 60–86400        | Independent refresh interval.   |
| `DISCORD_ALERT_MAX_AGE_SECONDS`    | `86400` | 60–86400        | Maximum pending-alert age.      |
| `DISCORD_MEMBERSHIP_CHECK_SECONDS` | `86400` | 3600–86400      | Bot-removal detection interval. |

The API runs one bounded cycle at startup and then every minute after the prior cycle finishes.
Postgres refresh leases, delivery claims, and membership-check claims coordinate replicas.
Each cycle checks up to 25 due servers and processes up to 50 due alerts. It does not replay
missed ticks. Shutdown stops new work and aborts Discord HTTP requests; interrupted attempts are
unknown and never resent. No Gateway, privileged intents, worker deployment, or broker is needed.

Configure the application's HTTPS Interactions Endpoint as `/discord/interactions` on the API
origin. It accepts signed PING and server-only `/claim setup`, `/claim status`, and `/claim stop`.
Interactions are acknowledged privately before outbound work; exact request bytes are verified,
with a five-minute timestamp window and a 64 KiB maximum body. Ten-minute, unassociated replay
hashes prevent repeated mutations or confirmations. The endpoint is omitted when disabled.

Register only the `claim` command explicitly for the intended application (never from preview CI):

```bash
# Development application, limited to one test server:
bun run --cwd packages/api discord:register --guild <server-id>
# Intended public application, explicitly global:
bun run --cwd packages/api discord:register --global
```

Registration upserts this command by name; it does not bulk-replace unrelated commands. Setup's
`channel` option selects an ordinary text channel. Optional `market` is `en-US` or `fr-FR`;
optional `stores` is `all` or a comma-separated non-empty subset of `epic-games`, `prime-gaming`,
`gog`, and `steam`. Settings confirmation is public; other responses are private. An uncertain
confirmation is not resent. Preferences and baselines survive restarts; settings changes never
redirect old work into a new channel. Setup repairs a disabled destination with new baselines.

Bot REST validation, confirmations, delivery, and registration share durable global and hashed
bucket backoff. Apply migrations and ensure Postgres is available before command registration.
Unassociated, token-salted bucket hashes expire with their embargo; cleanup requires the API to
operate. Ephemeral interaction webhooks use their own tokens and remain available during bot
global backoff. They never include the bot token.

Delivery diagnostics and disabled server data are purged within 30 days while the configured
Discord runtime operates;
stop and confirmed removal cascade-delete server configuration, baselines, work, and diagnostics.
Independent Store/Market occurrence history is retained so cleanup cannot recreate old alerts.
Sent Discord messages remain unchanged. Database backups, encryption, restricted access, support,
application provisioning, and verification remain operator responsibilities before public launch.

`DISCORD_ENABLED` controls this process's interactions and background work. Shared-cache refreshes
still preserve discovery for active subscriptions stored in Postgres, even on a process without
Discord credentials; this prevents a read-only replica from losing occurrence evidence for an
enabled replica. Keep replica configuration consistent and arrange retention cleanup if disabling
all Discord runtimes.

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
