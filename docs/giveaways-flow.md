# Giveaways request flow

How the `giveaways` module serves requests. `GET /giveaways*` reads from the Postgres cache (falling back to a
live upstream fetch only for a market that has never been refreshed), and a cron-triggered
`POST /giveaways/refresh` populates that cache. See [`architecture.md`](./architecture.md) for the file layout.

**Participants** (each maps to a file in `packages/api/src/modules/giveaways/`):

| Diagram name | Code |
| --- | --- |
| Route | `index.ts` — Elysia plugin: routing, TypeBox validation, 502/401 mapping |
| Service | `service.ts` — cache reads + live fan-out + refresh orchestration |
| Repository | `repository.ts` — SQL queries + row↔API mappers |
| DB | Postgres (`giveaways` + `giveaway_refreshes` tables) |
| Stores | the storefront adapters under `stores/*` calling Epic / Prime / GOG / Steam |

## Read: `GET /giveaways` (and `GET /giveaways/:store`)

The per-store endpoint is identical except the scope carries a single `store` and the live fallback / response
envelope are for that one store.

```mermaid
sequenceDiagram
    actor Client
    participant Route
    participant Service
    participant Repository
    participant DB
    participant Stores

    Client->>Route: GET /giveaways?locale&country
    Note over Route: TypeBox validates the query<br/>invalid locale/country → 422
    Route->>Service: getAllFreeGamesCached(db, {locale, country})

    Service->>Repository: findActiveGiveaways(scope)
    Repository->>DB: SELECT … WHERE locale, country AND free_until > now()
    DB-->>Repository: active rows
    Repository-->>Service: active rows

    alt active rows found — warm cache (1 query)
        Service-->>Route: { count, giveaways, errors: [] }
        Route-->>Client: 200
    else no active rows
        Service->>Repository: isRefreshed(scope)
        Repository->>DB: SELECT count FROM giveaway_refreshes WHERE scope
        DB-->>Repository: marker count
        Repository-->>Service: refreshed?

        alt marker exists — refreshed, nothing free right now
            Service-->>Route: { count: 0, giveaways: [], errors: [] }
            Route-->>Client: 200
        else no marker — never refreshed (cold fallback)
            Note over Service,Stores: getAllFreeGames() — concurrent fan-out to every store
            Service->>Stores: fetch live giveaways
            Stores-->>Service: per-store results / failures
            alt every store failed
                Service-->>Route: throw UpstreamError
                Route-->>Client: 502 (mapped in onError)
            else at least one store succeeded
                Service-->>Route: { count, giveaways, errors[] }
                Route-->>Client: 200
            end
        end
    end
```

Because rows are never deleted, `free_until > now()` alone decides "free right now", and the separate
`giveaway_refreshes` marker — not the row count — is what distinguishes "refreshed but empty" from "never
refreshed". That keeps a legitimately empty store (e.g. Steam with no promo) served from cache instead of
live-fetching on every request.

## Refresh: `POST /giveaways/refresh` (cron-triggered)

```mermaid
sequenceDiagram
    actor Cron
    participant Route
    participant Service
    participant Repository
    participant DB
    participant Stores

    Cron->>Route: POST /giveaways/refresh (x-refresh-token)
    Note over Route: beforeHandle compares the token<br/>missing/mismatch → 401
    Route->>Service: refreshCache(db)

    loop each market in REFRESH_LOCALES
        Note over Service,Stores: getAllFreeGames() — concurrent fan-out
        Service->>Stores: fetch live giveaways for {locale, country}

        alt every store failed upstream
            Stores-->>Service: all fail → UpstreamError
            Note over Service: record market errors, continue (still 200)
        else fetched (all or partial)
            Stores-->>Service: giveaways + per-store errors
            Service->>Repository: upsertGiveaways(market, giveaways)
            Note over Repository: dedup by (store, id) first
            Repository->>DB: INSERT … ON CONFLICT DO UPDATE (never deletes)
            Note over Service,DB: a DB write error propagates → 500<br/>(not masked as an upstream failure)
            Service->>Repository: markStoresRefreshed(market, succeeded stores)
            Repository->>DB: upsert giveaway_refreshes (incl. empty stores)
        end
    end

    Service-->>Route: summary { startedAt, finishedAt, totalUpserted, markets[] }
    Route-->>Cron: 200
```

Upstream failures are expected and recorded per market (the request still returns `200` with a summary); a
database write failure is infrastructure-level and propagates so the endpoint returns a non-2xx a monitor can
act on. A store that succeeds — even with zero giveaways — is marked refreshed, which is what makes the read
path's "refreshed but empty" branch reachable.
