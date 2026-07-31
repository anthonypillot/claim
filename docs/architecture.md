# Architecture

How the Claim API is organized — **feature-based** — and how that layout grows as the
[roadmap](./roadmap.md) lands. The tree below is the **target** shape: unmarked entries ship
today, `[planned]` entries are roadmap items not built yet, shown so the structure is clear before
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
│  ├─ app.ts                   Elysia composition root
│  ├─ config.ts                env access (requireDatabaseUrl)
│  ├─ modules/                 one folder per FEATURE
│  │  ├─ giveaways/
│  │  │  ├─ index.ts
│  │  │  ├─ service.ts
│  │  │  ├─ model.ts            TypeBox API schema
│  │  │  ├─ repository.ts       cache queries + row↔API mappers (over src/db/schema.ts)
│  │  │  └─ stores/
│  │  │     ├─ shared.ts
│  │  │     ├─ epic-games/
│  │  │     ├─ prime-gaming/
│  │  │     ├─ steam/
│  │  │     ├─ gog/
│  │  │     └─ gamerpower/      [planned]
│  │  ├─ notifications/         [planned]
│  │  │  ├─ index.ts
│  │  │  ├─ service.ts
│  │  │  ├─ scheduler.ts
│  │  │  ├─ digest.ts
│  │  │  └─ channels/
│  │  │     ├─ shared.ts
│  │  │     ├─ discord/
│  │  │     └─ email/
│  │  └─ subscriptions/         [planned]
│  │     ├─ index.ts
│  │     ├─ service.ts
│  │     ├─ model.ts
│  │     └─ repository.ts
│  ├─ db/                      shared persistence infrastructure
│  │  ├─ client.ts             lazy getDb() + Database type
│  │  ├─ schema.ts             Drizzle tables (centralized, Drizzle convention)
│  │  └─ testing.ts            in-memory PGlite factory for tests
│  └─ utils/
│     └─ logger.ts
├─ drizzle/                    generated SQL migrations (drizzle-kit, out: ./drizzle)
├─ drizzle.config.ts · package.json · tsconfig.json · bunfig.toml · README.md
```

## Persistence (read-through cache)

See [`giveaways-flow.md`](./giveaways-flow.md) for the cache decisions and request flow.

`GET /giveaways*` is a **read-through cache** over **Postgres** (Drizzle ORM on Bun's native SQL driver).
Freshness is tracked independently per `(store, locale, country)`. Non-empty snapshots become stale at their
earliest giveaway expiry or after 24 hours, whichever comes first; empty snapshots use the 24-hour maximum.
Successful refreshes replace active snapshots transactionally, while failures preserve usable cached rows.
In-process coordination and a token-guarded Postgres lease deduplicate concurrent refreshes.

See [`giveaways-flow.md`](./giveaways-flow.md) for the complete cache decision table and failure behavior.

`src/db/` holds shared persistence infrastructure: connection/test plumbing and centralized Drizzle table
definitions. Following Drizzle's default layout, table definitions live in `src/db/schema.ts`
and migrations are generated into `./drizzle` (`drizzle.config.ts` sets `schema: "./src/db/schema.ts"`,
`out: "./drizzle"`); a new feature (e.g. `subscriptions/`) adds its table to `src/db/schema.ts` while keeping its
own `repository.ts` + `model.ts` in its module. Migrations are applied with the `drizzle-kit migrate` CLI
(`db:migrate`), so there is no hand-written runtime migrator. `drizzle-kit` (SQL generation + migrate) and
`@electric-sql/pglite` (test database) are dev-only and excluded from the production bundle, like `pino-pretty`.
