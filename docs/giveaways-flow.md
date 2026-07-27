# Giveaways request flow

`GET /giveaways*` is a read-through cache over Postgres. Cache scopes are independent per store,
locale, and country, with a 24-hour TTL. Supported locale/country inputs are canonicalized before
they reach an upstream or become cache keys.

| Participant | Code |
| --- | --- |
| Route | `index.ts` - query validation and HTTP error mapping |
| Service | `service.ts` - per-store freshness and upstream orchestration |
| Repository | `repository.ts` - transactional refreshes and row/API mapping |
| DB | `giveaways` history plus `giveaway_fetches` freshness markers |
| Stores | `stores/*` upstream adapters |

## Aggregate request

```mermaid
sequenceDiagram
    actor Client
    participant Route
    participant Service
    participant Repository
    participant DB
    participant Stores

    Client->>Route: GET /giveaways?locale&country
    Note over Route: Validate, canonicalize, reject unsupported values with 422
    Route->>Service: getAllFreeGamesCached(db, market)
    Service->>Repository: findFreshStoreIds(market)
    Repository->>DB: Read current giveaway_fetches markers
    DB-->>Service: Fresh store ids
    Note over Service: stale = STORE_IDS - fresh
    Service->>Stores: Fetch only stale stores concurrently
    Stores-->>Service: Per-store results or failures

    loop Each successful stale store
        Service->>Repository: refreshStore(market, store, giveaways)
        Repository->>DB: Transaction: deactivate old rows, upsert active rows, advance marker
    end

    Service->>Repository: findActiveGiveaways(market)
    Repository->>DB: SELECT known stores WHERE is_active AND free_until > now()
    DB-->>Service: Current rows
    Service-->>Route: Fresh/updated rows plus failed-store errors
    Route-->>Client: 200, or 502 when no store has usable data
```

## Refresh semantics

- Upstream response bodies are streamed with a 5 MiB decoded-size limit before HTML or JSON
  parsing; declared and undeclared oversized bodies fail the store refresh.
- Upstream I/O, shape validation, and external URL normalization finish before the database
  transaction starts. Only credential-free HTTP(S) URLs are persisted; unsafe or malformed URL
  fields become `null`.
- A successful empty response deactivates the previous store snapshot and advances its marker.
- A giveaway omitted by the latest response remains in the table with `is_active = false`.
- A returning giveaway is reactivated, keeps `first_seen_at`, and advances `last_seen_at`.
- A failed upstream is not written or marked fresh, so only that store is retried next time.
- A database failure rolls back deactivation, upserts, and the freshness marker together.
- Per-store endpoints use the same `refreshStore` path but check and fetch only one store.
