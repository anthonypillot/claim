# AGENTS.md

This file provides guidance to Code Agents when working with code in this repository.

## What this is

Claim is a small, read-only JSON HTTP API that aggregates free game giveaways across storefronts (Epic Games, Prime Gaming, GOG, and Steam today; GamerPower planned). Bun workspace monorepo (`packages/**`) with one package: `packages/api`, built on **Bun + Elysia + TypeBox**, with giveaways cached in **Postgres via Drizzle ORM**. See `docs/roadmap.md` (feature direction) and `docs/architecture.md` (target file tree).

## Commands

Run from the repo root — root scripts fan out to workspaces via `bun run --workspaces`:

```bash
bun install
bun run dev              # hot-reload server → http://localhost:3000 (OpenAPI UI at /openapi)
bun test                 # all tests
bun run test:watch
bun run test:coverage    # fixtures.ts and *.test.ts excluded (packages/api/bunfig.toml)
bun run lint             # oxlint   (lint:fix to autofix)
bun run format           # oxfmt    (format:check in CI style)
bun run typecheck        # tsc --noEmit
bun run build            # bundle → packages/api/build/index.js; start runs it with NODE_ENV=production
bun run db:generate      # drizzle-kit: diff src/db/schema.ts → new SQL in ./drizzle (commit it)
bun run db:migrate       # drizzle-kit migrate: apply committed migrations (needs DATABASE_URL + drizzle-kit)
```

**Environment**: `PORT` (default 3000), `LOG_LEVEL`, `NODE_ENV`; plus `DATABASE_URL` (Postgres connection, required wherever the DB is used). Access env through `src/config.ts` (`requireDatabaseUrl`), which fails fast at use — never at import — so `buildApp`/tests run without a database.

Single test file (from `packages/api/`): `bun test src/modules/giveaways/index.test.ts` — or filter by name: `bun test --test-name-pattern "returns 502"`.

## Architecture

**Feature-based modules** — one folder under `src/modules/` owns a feature end to end (routes, business logic, adapters, co-located tests). No cross-cutting `controllers/`/`services/`/`models/` layers; new capabilities become new sibling folders under `modules/` (see `docs/architecture.md` for the target tree including `notifications/` and `subscriptions/`).

The `giveaways` module shows the pattern each feature follows:

- `index.ts` — exports `createGiveaways(getDatabase = getDb)`, an Elysia plugin factory (`prefix: "/giveaways"`); registers routes, maps `UpstreamError` → HTTP 502 via `.error()`/`.onError()`. Mounted with `.use(createGiveaways())` in `src/app.ts`; the DB accessor is injected so tests pass an in-memory database and is resolved per request (never at construction, keeping `buildApp` IO-free).
- `service.ts` — cache orchestration kept separate from HTTP routing. Aggregate reads fetch only stale stores; per-store reads use the same refresh path.
- `model.ts` — TypeBox schemas (Elysia's `t`) are the single source of truth: they validate requests (invalid query → 422), generate the OpenAPI spec, and derive static types via `typeof Schema.static`. Also holds the supported markets, `STORE_IDS`, and `CACHE_TTL_HOURS`.
- `repository.ts` — the cache queries plus row↔API mappers. The Drizzle tables themselves live in the shared `src/db/schema.ts` (following Drizzle's convention, table definitions are centralized there rather than per-module; the module still owns its `repository.ts` queries and `model.ts` API schema over them).
- `stores/shared.ts` — the per-store contract (`FetchFreeGames`) plus `UpstreamError(store, message)`.
- `stores/epic-games/` — one folder per upstream: `api.ts` (raw fetch, wraps every failure in `UpstreamError`), `types.ts` (upstream response types), `mapper.ts` (filter + normalize to `Giveaway`), `fixtures.ts` (upstream-shaped test payload with one element per filter branch), `index.ts` (composes api + mapper and asserts the contract with `fetchFreeGames satisfies FetchFreeGames`).

**Adding a store** = new folder under `stores/` implementing `FetchFreeGames` (with the `satisfies` compile-time check), plus a route in the module's `index.ts`, plus its id in `STORE_IDS` (`model.ts`) and its fetcher in `storeFetchers` (`service.ts`) so the aggregate `GET /giveaways` picks it up — the registry's `satisfies` check enforces this at compile time.

**Persistence (read-through cache).** `GET /giveaways*` caches each `(store, locale, country)` independently for `CACHE_TTL_HOURS` (24h). A successful refresh transaction deactivates the previous snapshot, upserts returned rows as active, and advances `giveaway_fetches`; empty results are cached, failed stores remain stale, and active reads require `is_active` plus `free_until > now()`. Inactive rows retain first/last-seen history. `src/db/` is shared persistence infrastructure, with centralized table definitions in `src/db/schema.ts` and generated migrations in `./drizzle`.

## Testing pattern

Tests use `bun:test`. Outbound HTTP is stubbed with `spyOn(globalThis, "fetch")` returning the co-located fixture; restore it in `afterEach`. Route tests don't start a server — they call the Elysia instance directly, injecting an in-memory database. `createTestDatabase()` returns an owned `{ db, close }` PGlite context with committed migrations applied; suites must await `close()` in `afterAll`. Regenerate + commit migrations (`bun run db:generate`) after schema changes.

## Conventions

- TypeScript is maximally strict (`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature` — hence `process.env["PORT"]` bracket access, `verbatimModuleSyntax` — use `import type`). Imports include the explicit `.ts` extension.
- Named function declarations (`function foo() {}`) over arrow-function consts; `satisfies` for conformance to contract types.
- Formatting via oxfmt (100-col width, double quotes, trailing commas); linting via oxlint (correctness = error, suspicious = warn). `fixtures.ts` files are ignored by lint and coverage.
- Logging goes through `src/utils/logger.ts` (pino). `pino-pretty` is dev-only and must stay out of the production bundle — it's referenced only via the transport target string.
- `drizzle-kit` (migration generation) and `@electric-sql/pglite` (test database) are dev-only and must stay out of the production bundle — the same discipline as `pino-pretty`. `drizzle-kit` is used only by `drizzle.config.ts` + `db:*` scripts (including `db:migrate` = `drizzle-kit migrate`); PGlite only by `*.test.ts` / `src/db/testing.ts`. Migrations are applied via the `drizzle-kit migrate` CLI at deploy time — nothing under `src/db/` is imported by `src/index.ts`. Verify after `bun run build`: `build/index.js` must not contain `drizzle-kit`/`pglite`/`@electric-sql`.
- Never commit, never create pull requests, except if the user explicitly asks for it.
