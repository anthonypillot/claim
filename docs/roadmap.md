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

- **Read-through with a 24h TTL** — a scope (store × locale × country) fetched within `CACHE_TTL_HOURS` is
  served from the DB; past that, the next read re-fetches and re-caches. No cron, no separate refresh endpoint.
- **History** — rows are never deleted during refresh. Offers omitted by the latest successful store refresh
  become inactive; current results require both an active row and an unexpired free window.
- **Empty stores** — a store fetched with no current giveaway is remembered as fetched, so it's served empty
  from cache instead of hitting the upstream on every request.
- **Independent stores** — aggregate reads fetch only stale stores, so one failing upstream does not force
  healthy stores to refresh again.

### More stores

GamerPower is next.

### Scheduled notifications

On a regular cadence (e.g. weekly), push the current free-games digest — with per-game detail —
out of the API rather than only serving it on request:

- **Email** — send the same digest to a list of recipients.
- **Discord** — post the list to a configured channel.

### Subscription management

Endpoints to manage who gets notified and where:

- **Email recipients** — add, update, and remove addresses on the mailing list.
- **Discord** — configure the target channel / webhook.
