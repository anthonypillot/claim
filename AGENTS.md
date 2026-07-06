# AGENTS.md

This file provides guidance to Code Agents when working with code in this repository.

## What this is

Claim is a small, read-only JSON HTTP API that aggregates free game giveaways across storefronts (Epic Games, Prime Gaming, and GOG today; Steam and GamerPower planned). Bun workspace monorepo (`packages/**`) with one package: `packages/api`, built on **Bun + Elysia + TypeBox**. See `docs/roadmap.md` (feature direction) and `docs/architecture.md` (target file tree).

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
```

Single test file (from `packages/api/`): `bun test src/modules/giveaways/index.test.ts` — or filter by name: `bun test --test-name-pattern "returns 502"`.

Note: `src/index.ts` reads `package.json` and `../../package.json` relative to cwd, so start the server through the package scripts (root fan-out or from `packages/api/`), not with `bun src/index.ts` from elsewhere.

## Architecture

**Feature-based modules** — one folder under `src/modules/` owns a feature end to end (routes, business logic, adapters, co-located tests). No cross-cutting `controllers/`/`services/`/`models/` layers; new capabilities become new sibling folders under `modules/` (see `docs/architecture.md` for the target tree including `notifications/` and `subscriptions/`).

The `giveaways` module shows the pattern each feature follows:

- `index.ts` — Elysia plugin (`prefix: "/giveaways"`); registers routes, maps `UpstreamError` → HTTP 502 via `.error()`/`.onError()`. Mounted with `.use(giveaways)` in `src/index.ts`.
- `service.ts` — non-HTTP entry point to the feature, deliberately kept separate from routing so later features (e.g. the notifications digest) can call it directly.
- `model.ts` — TypeBox schemas (Elysia's `t`) are the single source of truth: they validate requests (invalid query → 422), generate the OpenAPI spec, and derive static types via `typeof Schema.static`.
- `stores/shared.ts` — the per-store contract (`FetchFreeGames`) plus `UpstreamError(store, message)`.
- `stores/epic-games/` — one folder per upstream: `api.ts` (raw fetch, wraps every failure in `UpstreamError`), `types.ts` (upstream response types), `mapper.ts` (filter + normalize to `Giveaway`), `fixtures.ts` (upstream-shaped test payload with one element per filter branch), `index.ts` (composes api + mapper and asserts the contract with `fetchFreeGames satisfies FetchFreeGames`).

**Adding a store** = new folder under `stores/` implementing `FetchFreeGames` (with the `satisfies` compile-time check), plus a route in the module's `index.ts`, plus its id in `STORE_IDS` (`model.ts`) and its fetcher in `storeFetchers` (`service.ts`) so the aggregate `GET /giveaways` picks it up — the registry's `satisfies` check enforces this at compile time.

## Testing pattern

Tests use `bun:test`. Outbound HTTP is stubbed with `spyOn(globalThis, "fetch")` returning the co-located fixture; restore it in `afterEach`. Route tests don't start a server — they call the Elysia instance directly: `giveaways.handle(new Request("http://localhost/giveaways/epic-games"))`.

## Conventions

- TypeScript is maximally strict (`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature` — hence `process.env["PORT"]` bracket access, `verbatimModuleSyntax` — use `import type`). Imports include the explicit `.ts` extension.
- Named function declarations (`function foo() {}`) over arrow-function consts; `satisfies` for conformance to contract types.
- Formatting via oxfmt (100-col width, double quotes, trailing commas); linting via oxlint (correctness = error, suspicious = warn). `fixtures.ts` files are ignored by lint and coverage.
- Logging goes through `src/utils/logger.ts` (pino). `pino-pretty` is dev-only and must stay out of the production bundle — it's referenced only via the transport target string.
