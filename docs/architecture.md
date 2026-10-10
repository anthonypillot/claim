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
│  │  │  ├─ read.ts              aggregate/per-store response policy
│  │  │  ├─ cache-scope.ts       deep read-through lifecycle + persistence implementation
│  │  │  ├─ model.ts             TypeBox API schema
│  │  │  └─ stores/
│  │  │     ├─ index.ts          exhaustive Store adapter registry
│  │  │     ├─ shared.ts
│  │  │     ├─ epic-games/
│  │  │     ├─ prime-gaming/
│  │  │     ├─ steam/
│  │  │     ├─ gog/
│  │  │     └─ gamerpower/      [planned]
│  │  ├─ discord/               signed interactions, commands, bot REST adapter
│  │  ├─ notifications/         occurrence detection, durable delivery, runtime scheduling
│  │  └─ subscriptions/         server configuration, baselines, lifecycle
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

See [`giveaways-flow.md`](./features/giveaways-flow.md) for the cache decisions and request flow.

`GET /giveaways*` is a **read-through cache** over **Postgres** (Drizzle ORM on Bun's native SQL driver).
Freshness is tracked independently per `(store, locale, country)`. Non-empty snapshots become stale at their
earliest giveaway expiry or after 24 hours, whichever comes first; empty snapshots use the 24-hour maximum.
Successful refreshes replace active snapshots transactionally, while failures preserve usable cached rows.
In-process coordination and a token-guarded Postgres lease deduplicate concurrent refreshes.

The Giveaway Cache Scope module owns that lifecycle end to end behind one resolver interface: freshness,
coordination, Store retrieval, snapshot replacement, failure state, and active-Giveaway reads. The Giveaway read
module consumes one resolution per Store and owns aggregate fan-out, sorting, degraded-Store reporting, and
per-Store response policy. Store retrieval remains the real adapter seam; PGlite exercises the concrete Drizzle
implementation in tests without a separate persistence interface.

See [`giveaways-flow.md`](./features/giveaways-flow.md) for the complete cache decision table and failure behavior.

`src/db/` holds shared persistence infrastructure: connection/test plumbing and centralized Drizzle table
definitions. Following Drizzle's default layout, table definitions live in `src/db/schema.ts`
and migrations are generated into `./drizzle` (`drizzle.config.ts` sets `schema: "./src/db/schema.ts"`,
`out: "./drizzle"`); a new feature (e.g. `subscriptions/`) adds its table to `src/db/schema.ts` while keeping its
persistence implementation and model in its feature module. Migrations are applied with the `drizzle-kit migrate` CLI
(`db:migrate`), so there is no hand-written runtime migrator. `drizzle-kit` (SQL generation + migrate) and
`@electric-sql/pglite` (test database) are dev-only and excluded from the production bundle, like `pino-pretty`.

## Discord notifications (opt-in, public launch gated)

See [`discord-notifications.md`](./features/discord-notifications.md) for the accepted scope and acceptance
coverage, tracked together in [issue #56](https://github.com/anthonypillot/claim/issues/56). The
original digest/email and public subscription-CRUD proposals are superseded:

- **Discord integration** owns signed server-only HTTP interactions, command authorization, and
  the bot REST transport. Administrators use `/claim setup`, `/claim status`, and `/claim stop`;
  no Gateway connection, Claim account, or public subscription-management API is needed.
- **Subscriptions** owns one text-channel destination per server, Store/Market preferences,
  baseline eligibility, forward-only changes, and disabled/deletion lifecycle. It reuses `src/db/`
  rather than introducing another persistence foundation.
- **Notifications** owns hourly traffic-independent monitoring, recurring-occurrence detection,
  durable eligible delivery work, outcomes, and scheduling inside the API process. Successful
  public reads of monitored scopes participate in the same discovery path. Persist the durable
  handoff with successful snapshot replacement, not through a lossy timer-only scan or callback.

The Giveaway Cache Scope remains the shared refresh boundary: preserve its adapter, transaction,
failure, and lease behavior while adding an independent hourly refresh deadline for subscribed
scopes. The current 24-hour read-through freshness alone cannot support hourly discovery.

Start background work in the runtime bootstrap, never in `buildApp` or import-time side effects.
Postgres coordinates API replicas and stores delivery attempts; refresh leases alone do not
deduplicate sends. No separate worker deployment, Redis, or message broker is planned. Uncertain
sends are not retried, as explained in the
[reliability ADR](./adr/0001-avoid-uncertain-discord-resends.md).

Email adapters, generalized digest contracts, and account/dashboard infrastructure are deferred.
The Discord module exposes signed HTTP interactions; subscriptions expose setup/status/stop;
notifications expose one monitoring/delivery cycle and bootstrap-only start/stop. Their concrete
Drizzle implementation is tested with PGlite and mocked Store/Discord HTTP adapters. The web
provides localized install/help/privacy/support pages behind a separate public-install launch gate.
See [Discord Operations](./features/discord-operations.md) for prerequisites that still require operator
verification.
