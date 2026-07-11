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

Giveaways are cached in **Postgres** (Drizzle ORM) and `GET /giveaways*` is served from the database
rather than by calling every storefront on each request — faster, and resilient to upstream outages:

- **Refresh** — a cron job calls `POST /giveaways/refresh` (guarded by the `REFRESH_TOKEN` header), which
  fetches every store for each market in `REFRESH_LOCALES` and upserts the results. A store that fails
  leaves its existing rows intact.
- **History** — rows are never deleted on expiry, so past giveaways are retained; "currently free" is just
  the rows still inside their free window.
- **Cold-cache fallback** — a market that has never been refreshed falls back to a live upstream fetch, so a
  fresh deploy never returns an empty list.

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
