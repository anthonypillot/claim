# Architecture

How the Claim API is organized — **feature-based** — and how that layout grows as the
[roadmap](./roadmap.md) lands. The tree below is the **target** shape: unmarked entries ship
today, `` entries are roadmap items not built yet, shown so the structure is clear before
the code exists.

## Feature-based architecture

One folder owns a feature end to end — its routes, business logic, data/delivery adapters, and
co-located tests all live together. There are no cross-cutting `controllers/`, `services/`, or
`models/` layer folders. Each capability on the roadmap becomes another folder under `modules/`,
so the app scales by adding features side by side rather than by growing shared layers.

## Target file tree

```
packages/api/
├─ src/
│  ├─ index.ts                 entry point
│  ├─ config.ts                env access (requireDatabaseUrl / requireRefreshToken)
│  ├─ modules/                 one folder per FEATURE
│  │  ├─ giveaways/
│  │  │  ├─ index.ts
│  │  │  ├─ service.ts
│  │  │  ├─ model.ts            TypeBox API schema
│  │  │  ├─ schema.ts           Drizzle table — the feature owns its storage
│  │  │  ├─ repository.ts       cache queries + row↔API mappers
│  │  │  └─ stores/
│  │  │     ├─ shared.ts
│  │  │     ├─ epic-games/
│  │  │     ├─ prime-gaming/
│  │  │     ├─ steam/
│  │  │     ├─ gog/
│  │  │     └─ gamerpower/
│  │  ├─ notifications/
│  │  │  ├─ index.ts
│  │  │  ├─ service.ts
│  │  │  ├─ scheduler.ts
│  │  │  ├─ digest.ts
│  │  │  └─ channels/
│  │  │     ├─ shared.ts
│  │  │     ├─ discord/
│  │  │     └─ email/
│  │  └─ subscriptions/
│  │     ├─ index.ts
│  │     ├─ service.ts
│  │     ├─ model.ts
│  │     └─ repository.ts
│  ├─ database/                SHARED INFRA (peer of utils/) — no feature data
│  │  ├─ client.ts             lazy getDb() + Database type
│  │  ├─ migrate.ts            runtime migrator (the db:migrate script)
│  │  ├─ testing.ts            in-memory PGlite factory for tests
│  │  └─ migrations/           generated SQL (drizzle-kit)
│  └─ utils/
│     └─ logger.ts
├─ drizzle.config.ts · package.json · tsconfig.json · bunfig.toml · README.md
```

## Persistence (read-through cache)

See [`giveaways-flow.md`](./giveaways-flow.md) for the read-through sequence diagram.

`GET /giveaways*` is a **read-through cache** over **Postgres** (Drizzle ORM on Bun's native SQL driver). When
the requested scope is fresh (fetched within `CACHE_TTL_HOURS`, 24h) the active cached rows
(`free_until > now()`) are served directly; on a miss the read fetches live, **upserts** the result (keyed by
`(store, id, locale, country)`, never deleted → the table doubles as history), records the fetch time in
`giveaway_fetches`, and serves it. The `giveaway_fetches` marker is per `(store, locale, country)`, so a store
fetched with zero giveaways is still "fresh" and served empty rather than re-fetched every request.

`src/database/` holds only shared plumbing — connection, migrations, test factory — the same non-feature role
as `utils/logger.ts`. Each feature owns its own table: `modules/giveaways/schema.ts` (paralleling `model.ts`)
plus its `repository.ts`. There is no shared schema barrel; `drizzle.config.ts` globs `./src/modules/**/schema.ts`,
so a new feature (e.g. `subscriptions/`) adds its own `schema.ts` and drizzle-kit picks it up with no changes to
the shared layer. `drizzle-kit` (SQL generation) and `@electric-sql/pglite` (test database) are dev-only and
excluded from the production bundle, like `pino-pretty`.
