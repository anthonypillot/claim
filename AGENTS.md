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

Note: `src/index.ts` reads `package.json` and `../../package.json` relative to cwd, so start the server through the package scripts (root fan-out or from `packages/api/`), not with `bun src/index.ts` from elsewhere.

## Architecture

**Feature-based modules** — one folder under `src/modules/` owns a feature end to end (routes, business logic, adapters, co-located tests). No cross-cutting `controllers/`/`services/`/`models/` layers; new capabilities become new sibling folders under `modules/` (see `docs/architecture.md` for the target tree including `notifications/` and `subscriptions/`).

The `giveaways` module shows the pattern each feature follows:

- `index.ts` — exports `createGiveaways(getDatabase = getDb)`, an Elysia plugin factory (`prefix: "/giveaways"`); registers routes, maps `UpstreamError` → HTTP 502 via `.error()`/`.onError()`. Mounted with `.use(createGiveaways())` in `src/app.ts`; the DB accessor is injected so tests pass an in-memory database and is resolved per request (never at construction, keeping `buildApp` IO-free).
- `service.ts` — non-HTTP entry point to the feature, deliberately kept separate from routing so later features (e.g. the notifications digest) can call it directly. Holds the live fan-out (`getAllFreeGames`) and the read-through cache readers (`getAllFreeGamesCached` / `getStoreFreeGamesCached`, which serve fresh cached rows or fetch-then-cache on a miss).
- `model.ts` — TypeBox schemas (Elysia's `t`) are the single source of truth: they validate requests (invalid query → 422), generate the OpenAPI spec, and derive static types via `typeof Schema.static`. Also holds `STORE_IDS` and `CACHE_TTL_HOURS` (the cache freshness window).
- `repository.ts` — the cache queries plus row↔API mappers. The Drizzle tables themselves live in the shared `src/db/schema.ts` (following Drizzle's convention, table definitions are centralized there rather than per-module; the module still owns its `repository.ts` queries and `model.ts` API schema over them).
- `stores/shared.ts` — the per-store contract (`FetchFreeGames`) plus `UpstreamError(store, message)`.
- `stores/epic-games/` — one folder per upstream: `api.ts` (raw fetch, wraps every failure in `UpstreamError`), `types.ts` (upstream response types), `mapper.ts` (filter + normalize to `Giveaway`), `fixtures.ts` (upstream-shaped test payload with one element per filter branch), `index.ts` (composes api + mapper and asserts the contract with `fetchFreeGames satisfies FetchFreeGames`).

**Adding a store** = new folder under `stores/` implementing `FetchFreeGames` (with the `satisfies` compile-time check), plus a route in the module's `index.ts`, plus its id in `STORE_IDS` (`model.ts`) and its fetcher in `storeFetchers` (`service.ts`) so the aggregate `GET /giveaways` picks it up — the registry's `satisfies` check enforces this at compile time.

**Persistence (read-through cache).** `GET /giveaways*` is a read-through cache over Postgres: a read serves the active cached rows (`free_until > now()`) when the scope is fresh, else it fetches live, **upserts** the result (keyed by `(store, id, locale, country)`, never deleted → rows double as history), records the fetch time in `giveaway_fetches`, and serves it. Freshness is per `(store, locale, country)` within `CACHE_TTL_HOURS` (24h); the `giveaway_fetches` marker is what lets a fetched-but-empty store serve empty instead of re-fetching. `src/db/` is **shared infrastructure** (client + PGlite test factory) — a peer of `utils/`, not a feature layer. Following Drizzle's default layout, table definitions are centralized in `src/db/schema.ts` (`drizzle.config.ts` points `schema` at it and generates migrations into `./drizzle`), and migrations are applied with the `drizzle-kit migrate` CLI (`db:migrate`) — there is no hand-written runtime migrator. For Drizzle / drizzle-kit syntax, fetch the official docs index at https://orm.drizzle.team/llms.txt (the doc site is a SPA — use `llms.txt` or the raw GitHub MDX, not scraped HTML pages).

## Testing pattern

Tests use `bun:test`. Outbound HTTP is stubbed with `spyOn(globalThis, "fetch")` returning the co-located fixture; restore it in `afterEach`. Route tests don't start a server — they call the Elysia instance directly, injecting an in-memory database: `createGiveaways(() => testDb).handle(new Request("http://localhost/giveaways/epic-games"))`. The DB seam is `createTestDatabase()` (`src/db/testing.ts`), a real PGlite (Postgres-in-WASM) instance with the committed migrations applied — so repository SQL runs for real with no external Postgres and CI stays hermetic. Regenerate + commit migrations (`bun run db:generate`) before running tests after a schema change, or the PGlite migrator replays stale SQL.

## Conventions

- TypeScript is maximally strict (`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature` — hence `process.env["PORT"]` bracket access, `verbatimModuleSyntax` — use `import type`). Imports include the explicit `.ts` extension.
- Named function declarations (`function foo() {}`) over arrow-function consts; `satisfies` for conformance to contract types.
- Formatting via oxfmt (100-col width, double quotes, trailing commas); linting via oxlint (correctness = error, suspicious = warn). `fixtures.ts` files are ignored by lint and coverage.
- Logging goes through `src/utils/logger.ts` (pino). `pino-pretty` is dev-only and must stay out of the production bundle — it's referenced only via the transport target string.
- `drizzle-kit` (migration generation) and `@electric-sql/pglite` (test database) are dev-only and must stay out of the production bundle — the same discipline as `pino-pretty`. `drizzle-kit` is used only by `drizzle.config.ts` + `db:*` scripts (including `db:migrate` = `drizzle-kit migrate`); PGlite only by `*.test.ts` / `src/db/testing.ts`. Migrations are applied via the `drizzle-kit migrate` CLI at deploy time — nothing under `src/db/` is imported by `src/index.ts`. Verify after `bun run build`: `build/index.js` must not contain `drizzle-kit`/`pglite`/`@electric-sql`.
- Never commit, never create pull requests, except if the user explicitly asks for it.
