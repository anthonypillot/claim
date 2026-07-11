# Claim API

The HTTP API for [Claim](../../README.md) — a small, read-only JSON API that serves free
game giveaways aggregated across storefronts (Epic Games, Amazon Prime Gaming, GOG, and Steam today).

Built with **Bun**, **Elysia**, **TypeBox**, **pino**, and **Drizzle ORM** on **Postgres** (giveaways are
cached and served from the database; see [Database](#database)).

## Run it

From the repo root (preferred — root scripts fan out to the workspace):

```bash
bun install
cp packages/api/.env.example packages/api/.env   # then fill in DATABASE_URL / REFRESH_TOKEN
bun run dev      # hot-reload → http://localhost:3000
```

Or from this package directory:

```bash
bun run dev            # hot-reload
bun test               # run tests
bun run build          # production bundle → build/index.js
bun run start          # run the bundle (NODE_ENV=production, cluster mode)
```

## Database

`GET /giveaways*` is served from Postgres. Set `DATABASE_URL` (and `REFRESH_TOKEN`, which guards the refresh
endpoint) before running the server or migrations. A cold/empty cache falls back to a live upstream fetch, so
the API works before the first refresh.

Spin up a local Postgres and apply the schema:

```bash
docker run --rm -e POSTGRES_PASSWORD=claim -p 5432:5432 postgres:17
export DATABASE_URL=postgres://postgres:claim@localhost:5432/postgres
export REFRESH_TOKEN=dev-secret

bun run db:migrate     # apply committed migrations (run from packages/api)
```

Warm the cache, then read it:

```bash
curl -X POST -H "x-refresh-token: $REFRESH_TOKEN" localhost:3000/giveaways/refresh
curl localhost:3000/giveaways
```

Schema changes: edit a feature's `schema.ts` (e.g. `src/modules/giveaways/schema.ts`), then
`bun run db:generate` to produce a new migration under `src/database/migrations/` and **commit it**. The
markets that the refresh job caches are the `REFRESH_LOCALES` list in `src/modules/giveaways/model.ts` —
extend it to cache more locale/country combinations.

> Deploy note: `bun build` bundles JavaScript only, not the `.sql` migration files. Run `bun run db:migrate`
> from source at deploy time (it reads `src/database/migrations/` relative to the source file); don't try to
> migrate from the `build/` bundle. `drizzle-kit` and PGlite are dev-only and never enter the bundle.

## Where to look

- **API contract** (endpoints, params, response shape) — the live OpenAPI spec at `/openapi`
  (`/openapi/json`).
- **What Claim does & where it's headed** — [`docs/roadmap.md`](../../docs/roadmap.md).
- **Architecture** (file tree, feature-based layout) —
  [`docs/architecture.md`](../../docs/architecture.md).
- **Conventions & pitfalls** (strict TypeScript, testing patterns) —
  [`AGENTS.md`](../../AGENTS.md).

## Layout

The annotated file tree and the feature-based layout live in
[`docs/architecture.md`](../../docs/architecture.md).
