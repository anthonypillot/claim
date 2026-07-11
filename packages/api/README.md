# Claim API

The HTTP API for [Claim](../../README.md) — a small, read-only JSON API that serves free
game giveaways aggregated across storefronts (Epic Games, Amazon Prime Gaming, GOG, and Steam today).

Built with **Bun**, **Elysia**, **TypeBox**, **pino**, and **Drizzle ORM** on **Postgres** (giveaways are
cached and served from the database; see [Database](#database)).

## Run it

From the repo root (preferred — root scripts fan out to the workspace):

```bash
bun install
cp packages/api/.env.example packages/api/.env   # then fill in DATABASE_URL
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

`GET /giveaways*` is a **read-through cache** over Postgres: on a miss it fetches live, writes the result to the
DB, and serves it; subsequent reads within the TTL (`CACHE_TTL_HOURS`, 24h) are served from the DB. Set
`DATABASE_URL` before running the server or migrations.

Spin up a local Postgres and apply the schema:

```bash
docker run --rm -e POSTGRES_PASSWORD=claim -p 5432:5432 postgres:17
export DATABASE_URL=postgres://postgres:claim@localhost:5432/postgres

bun run db:migrate     # apply committed migrations (run from packages/api)
```

Then just read — the first call fetches and caches, the next is served from the DB:

```bash
curl localhost:3000/giveaways          # cold: fetches live + caches
curl localhost:3000/giveaways          # warm: served from the cache
```

Schema changes: edit a feature's `schema.ts` (e.g. `src/modules/giveaways/schema.ts`), then
`bun run db:generate` to produce a new migration under `src/database/migrations/` and **commit it**.

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
