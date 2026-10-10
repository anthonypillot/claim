# Roadmap

What Claim does today, and where it's headed.

## What Claim is

Claim is a small, read-only JSON HTTP API that aggregates **free game giveaways** across
storefronts. Ask it what's free right now and get back a normalized list — per-locale titles and
descriptions, and the details needed to surface or claim each offer.

## Feature set

### Stores

- **All stores** — `GET /giveaways` — merged list across every store, each item tagged with its
  `store`; stores that fail upstream land in `errors` instead of failing the request.
- **Epic Games** — `GET /giveaways/epic-games`
- **Amazon Prime Gaming** — `GET /giveaways/prime-gaming` (full games only; in-game loot excluded)
- **GOG** — `GET /giveaways/gog` (homepage banner giveaways; empty when none is running)
- **Steam** — `GET /giveaways/steam` (time-limited "keep forever" 100%-off promos; free-to-play
  titles excluded; empty when none is running)

### Persistence & caching

Giveaways are cached in **Postgres** (Drizzle ORM). `GET /giveaways*` is a **read-through cache**: a read
serves from the database when the data is fresh, and otherwise fetches live, stores the result, and serves it —
faster on repeat reads and resilient to upstream hiccups:

- **Expiry-aware read-through** — each store × locale × country scope is cached until its earliest giveaway
  expires or its 24-hour maximum TTL ends. The next read refreshes stale scopes; there is no cron or separate
  refresh endpoint.
- **History** — rows are never deleted during refresh. Offers omitted by the latest successful store refresh
  become inactive; current results require both an active row and an unexpired free window.
- **Empty stores** — a store fetched with no current giveaway is remembered as fetched, so it's served empty
  from cache instead of hitting the upstream on every request.
- **Independent stores** — aggregate reads fetch only stale stores, so one failing upstream does not force
  healthy stores to refresh again.
- **Stale on error** — failed refreshes preserve and serve the last successful snapshot, with degraded stores
  reported by aggregate reads. A five-minute failure cooldown prevents retry storms.
- **Refresh coordination** — concurrent requests share refresh work within one process, and a token-guarded
  60-second Postgres lease prevents duplicate upstream calls across replicas.

See [`giveaways-flow.md`](./features/giveaways-flow.md) for a concise table of cache and upstream-call behavior.

### More stores

GamerPower is next.

### Discord Giveaway Alerts (implemented, opt-in)

An installable Discord bot announces newly detected Giveaway Occurrences, not recurring digests
of everything currently free. The [accepted design](./features/discord-notifications.md) replaces the
original email/Discord digest proposal:

- **Discovery** — configurable hourly checks inside the API process, independent of website
  traffic; successful public API refreshes also participate in discovery.
- **Announcements** — one compact message per occurrence, with title, Store, claim link, deadline,
  and optional artwork/original price. Prime offers disclose the membership requirement.
- **No backlog** — the first successful observation establishes a baseline without alerts;
  genuinely later giveaway periods can alert, but extensions and ambiguous returns do not.
- **Delivery policy** — prefer missed alerts over duplicates: never resend an uncertain attempt.
  Pending alerts expire after 24 hours or the Giveaway deadline, whichever comes first.

Email is a later step. DMs, expiry reminders, periodic digests, automatic mentions, and edits or
deletions of sent announcements are not part of the Discord first version.

### Discord subscription management (implemented, public launch pending)

Administrators manage one ordinary text-channel destination per server through `/claim setup`,
`/claim status`, and `/claim stop`, without Claim accounts or a public subscription CRUD API:

- **Preferences** — all supported Stores by default or a selected subset; English/US or
  French/France. All-Stores mode follows future supported Stores without a catch-up.
- **Changes** — apply forward only; newly followed Stores/Markets establish fresh baselines.
- **Authorization** — signed HTTP interactions plus execution-time Manage Server/Administrator
  checks and destination permission validation; no persistent Gateway connection.
- **Lifecycle** — disable broken destinations until repaired, retain diagnostics at most 30 days,
  and purge server-specific data on stop or confirmed bot removal.
- **Public launch** — install/help/privacy information, a support/deletion route, configured Discord
  credentials, and protected data storage are required before enabling the feature.

[Issue #56](https://github.com/anthonypillot/claim/issues/56) covers discovery/delivery and
Discord-native subscription management together, reusing the existing Postgres foundation.

Implementation defaults to off. Public application provisioning, protected storage, and the
configured private support route must be verified through the
[operations checklist](./features/discord-operations.md) before public installation is enabled.
