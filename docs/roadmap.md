# Roadmap

What Claim does today, and where it's headed.

## What Claim is

Claim is a small, read-only JSON HTTP API that aggregates **free game giveaways** across
storefronts. Ask it what's free right now and get back a normalized list — per-locale titles and
descriptions, and the details needed to surface or claim each offer.

## Feature set

### Stores

- **Epic Games** — `GET /giveaways/epic-games`

### More stores

Amazon Prime Gaming, Steam, GOG, and GamerPower are next.

### Scheduled notifications

On a regular cadence (e.g. weekly), push the current free-games digest — with per-game detail —
out of the API rather than only serving it on request:

- **Email** — send the same digest to a list of recipients.
- **Discord** — post the list to a configured channel.

### Subscription management

Endpoints to manage who gets notified and where:

- **Email recipients** — add, update, and remove addresses on the mailing list.
- **Discord** — configure the target channel / webhook.
