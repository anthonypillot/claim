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

### More stores

Steam and GamerPower are next.

### Scheduled notifications

On a regular cadence (e.g. weekly), push the current free-games digest — with per-game detail —
out of the API rather than only serving it on request:

- **Email** — send the same digest to a list of recipients.
- **Discord** — post the list to a configured channel.

### Subscription management

Endpoints to manage who gets notified and where:

- **Email recipients** — add, update, and remove addresses on the mailing list.
- **Discord** — configure the target channel / webhook.
