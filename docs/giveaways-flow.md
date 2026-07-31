# Giveaways cache flow

`GET /giveaways*` uses a request-driven read-through cache in Postgres. There is no scheduled job or
manual refresh endpoint: the first request for stale data refreshes it from the relevant store.

## Cache scope

Each `(store, locale, country)` combination has its own cache. For example, Epic Games for `en-US` and
`US` is independent from Epic Games for `fr-FR` and `FR`, and from every other store.

The aggregate `GET /giveaways` endpoint checks all store scopes for the requested market. A per-store
endpoint such as `GET /giveaways/epic-games` checks only that store.

## When stores are called

| Cache state | Result | Upstream call |
| --- | --- | --- |
| Current snapshot is fresh | Serve it from Postgres | No |
| Earliest cached giveaway expires | The next request refreshes that store | Yes |
| Snapshot reaches the 24-hour maximum TTL | The next request refreshes that store | Yes |
| Last successful result was empty | Serve empty for up to 24 hours | No |
| Refresh fails | Preserve usable cached giveaways and wait five minutes before retrying | One failed attempt |
| Several requests arrive together | They share the same refresh work | One per cache scope |

A non-empty snapshot is fresh until the earlier of:

1. Its earliest giveaway expiration.
2. Twenty-four hours after it was fetched.

This expiry-aware deadline handles store rotations. When old Epic Games offers end, the next request
fetches the newly started offers instead of serving an empty result until the 24-hour TTL ends.

This can add one useful upstream call at a giveaway rollover. It does not add a call per visitor:
in-process coordination and a Postgres lease ensure that concurrent requests share one refresh for the
same store, locale, and country.

## Request flow

1. Validate and canonicalize the requested locale and country.
2. Check each requested store's freshness marker in Postgres.
3. Serve fresh scopes directly from Postgres.
4. Acquire a 60-second lease and fetch each stale scope from its store.
5. Replace successful snapshots transactionally, then serve current, unexpired rows.

## Failures and history

- A successful empty result deactivates the previous snapshot and remains fresh for up to 24 hours.
- A failed refresh does not replace the previous snapshot or mark it fresh.
- Cached giveaways are served after a failure only while their free window is still active.
- Failed scopes wait five minutes before another request retries them.
- Aggregate responses list degraded stores in `errors`; a per-store request returns `502` when no
  successful snapshot is available.
- Omitted giveaways become inactive rather than being deleted, preserving first- and last-seen history.
- A database error rolls back the snapshot replacement and freshness update together.

Upstream responses are limited to 5 MiB before parsing. Only credential-free HTTP(S) giveaway and image
URLs are persisted; malformed or unsafe URLs are stored as `null`.
