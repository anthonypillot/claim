# AGENTS.md

## Repository

Claim is a Bun workspace monorepo (`packages/**`) for free-game giveaways:

- `packages/api`: Bun + Elysia + TypeBox JSON API; Postgres cache via Drizzle ORM.
- `packages/web`: SvelteKit 2 + Svelte 5 site; Tailwind CSS 4 and shadcn-svelte.

`docs/architecture.md` describes the API's feature-based target structure; planned entries are not
implemented. `docs/giveaways-flow.md` documents the read-through cache.

## Commands

Run workspace commands from the repository root:

```bash
bun install
bun run dev              # API :3000 and Vite dev server
bun test                 # both workspaces
bun run build            # both workspaces
bun run lint
bun run format:check
bun run typecheck
```

The root `lint`, `format:*`, and `typecheck` scripts use `--if-present`; currently only the API
defines them. Validate the web package separately from `packages/web` with `bun run check`. A full
web verification is `bun run check`, `bun run test`, then `bun run build`.

Focused tests (run from the package shown):

- API: `bun test src/modules/giveaways/index.test.ts`; filter with
  `bun test --test-name-pattern "returns 502"`.
- Web: `bun run test:unit -- --run src/lib/giveaways/model.test.ts`.

## API

- `src/index.ts` binds the server; `src/app.ts` is the IO-free Elysia composition root. Tests call
  `buildApp(...).handle(new Request(...))` rather than starting a server.
- Features own routes, service logic, adapters, and tests under `src/modules/<feature>/`; do not
  introduce cross-cutting controller/service/model directories.
- `GET /health` is database-independent. `GET /ready` queries Postgres and returns 503 on failure.
- `DATABASE_URL` is required only when database access occurs. Keep environment access lazy through
  `src/config.ts` so imports, `buildApp`, `/health`, and database-independent tests work without it.
- TypeBox schemas in `modules/giveaways/model.ts` drive validation, OpenAPI, and static types.
- Adding a store requires its adapter implementing `FetchFreeGames`, an ID in `STORE_IDS`, a fetcher
  in `storeFetchers`, and a route. The `satisfies` registry check intentionally makes omissions fail
  type checking.
- The cache is scoped by `(store, locale, country)` for 24 hours. Successful refreshes replace the
  active snapshot transactionally; empty results are cached and failed stores remain stale.

### Database And Tests

Run Drizzle scripts from `packages/api`: `bun run db:generate` after schema changes and
`bun run db:migrate` to apply committed migrations. Tables live in `src/db/schema.ts`; generated
migrations live in `drizzle/` and must accompany schema changes. `generate` needs no database;
`migrate`, `push`, and `studio` require `DATABASE_URL`.

API tests use `bun:test`. Route/repository suites use `createTestDatabase()`, which applies committed
migrations to an in-memory PGlite database and returns `{ db, close }`; close it in `afterAll`.
Outbound HTTP tests stub `globalThis.fetch` with co-located fixtures and restore it in `afterEach`.

`drizzle-kit`, `@electric-sql/pglite`, and `pino-pretty` are development-only and must not enter the
production bundle. After API build changes, confirm `build/index.js` contains none of
`drizzle-kit`, `pglite`, or `@electric-sql`. Build the image from the repository root with
`docker build --file packages/api/Dockerfile --tag claim-api .`; its `/health` check must stay
database-independent. Apply migrations from source before deployment.

## Web

- Svelte runes mode is forced for project files and `adapter-auto` is configured inside
  `packages/web/vite.config.ts`; there is no separate `svelte.config.*`.
- During development, browser and SSR requests under `/api/*` are rewritten to
  `http://localhost:3000`. Production SSR currently fetches
  `https://api.claim.anthonypillot.fr` directly.
- shadcn-svelte configuration is `packages/web/components.json`: Rhea style, Taupe base color,
  Hugeicons, components under `src/lib/components/ui`, and theme variables in
  `src/routes/layout.css`. Use the repository's `shadcn-svelte` skill for component work and preserve
  this preset rather than assuming shadcn defaults.
- `bun run brand:export` from `packages/web` regenerates and verifies the SVG and raster files under
  `static/`; treat those assets as generated outputs of `scripts/export-brand-assets.js`.

## External Documentation

When repository context is insufficient, fetch only the relevant official source before deciding on
current framework behavior:

- Bun: https://bun.com/llms.txt
- Oxc: https://oxc.rs/llms.txt
- Elysia: https://elysiajs.com/llms.txt
- Drizzle ORM: https://orm.drizzle.team/llms.txt
- Svelte and SvelteKit: https://svelte.dev/llms.txt
- shadcn-svelte: https://shadcn-svelte.com/llms.txt

## Conventions

- API TypeScript uses maximal strictness, explicit `.ts` import extensions, `import type`, named
  function declarations, and `satisfies` for contracts. Preserve the web package's Svelte-generated
  import conventions instead of applying API conventions blindly.
- Oxfmt uses 100-column width, double quotes, semicolons, and trailing commas. Oxlint ignores
  `fixtures.ts` and generated migrations; API coverage also excludes fixtures and test files.
- Log API behavior through `src/utils/logger.ts`; do not add direct runtime console logging.
- Never commit or create a pull request unless the user explicitly requests it.
