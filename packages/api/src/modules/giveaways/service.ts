import type { Database } from "../../database/client.ts";
import { logger } from "../../utils/logger.ts";
import type {
  AllGiveawaysResponse,
  EpicGamesGiveawaysResponse,
  Giveaway,
  GogGiveawaysResponse,
  PrimeGamingGiveawaysResponse,
  RefreshSummaryResponse,
  SteamGiveawaysResponse,
  StoreGiveaway,
  StoreId,
} from "./model.ts";
import { REFRESH_LOCALES, STORE_IDS } from "./model.ts";
import {
  findActiveGiveaways,
  isRefreshed,
  markStoresRefreshed,
  toGiveaway,
  toStoreGiveaway,
  upsertGiveaways,
} from "./repository.ts";
import { fetchFreeGames as fetchEpicGamesGiveaways } from "./stores/epic-games/index.ts";
import { fetchFreeGames as fetchGogGiveaways } from "./stores/gog/index.ts";
import { fetchFreeGames as fetchPrimeGamingGiveaways } from "./stores/prime-gaming/index.ts";
import { fetchFreeGames as fetchSteamGiveaways } from "./stores/steam/index.ts";
import type { FetchFreeGames } from "./stores/shared.ts";
import { UpstreamError } from "./stores/shared.ts";

/** Non-HTTP entry point to the feature (reused later by e.g. the notifications digest). */
export async function getEpicGamesFreeGames(options: {
  locale: string;
  country: string;
}): Promise<EpicGamesGiveawaysResponse> {
  const giveaways = await fetchEpicGamesGiveaways(options);
  return { store: "epic-games", count: giveaways.length, giveaways };
}

export async function getPrimeGamingFreeGames(options: {
  locale: string;
  country: string;
}): Promise<PrimeGamingGiveawaysResponse> {
  const giveaways = await fetchPrimeGamingGiveaways(options);
  return { store: "prime-gaming", count: giveaways.length, giveaways };
}

export async function getGogFreeGames(options: {
  locale: string;
  country: string;
}): Promise<GogGiveawaysResponse> {
  const giveaways = await fetchGogGiveaways(options);
  return { store: "gog", count: giveaways.length, giveaways };
}

export async function getSteamFreeGames(options: {
  locale: string;
  country: string;
}): Promise<SteamGiveawaysResponse> {
  const giveaways = await fetchSteamGiveaways(options);
  return { store: "steam", count: giveaways.length, giveaways };
}

// Adding a store id to STORE_IDS is a compile error until its fetcher is registered here.
const storeFetchers = {
  "epic-games": fetchEpicGamesGiveaways,
  "prime-gaming": fetchPrimeGamingGiveaways,
  gog: fetchGogGiveaways,
  steam: fetchSteamGiveaways,
} as const satisfies Record<StoreId, FetchFreeGames>;

type StoreResult =
  | { store: StoreId; ok: true; giveaways: Giveaway[] }
  | { store: StoreId; ok: false; error: unknown };

/** Fans out to every store concurrently; a failed store becomes an `errors` entry unless all fail. */
export async function getAllFreeGames(options: {
  locale: string;
  country: string;
}): Promise<AllGiveawaysResponse> {
  const results = await Promise.all(
    STORE_IDS.map(async (store): Promise<StoreResult> => {
      try {
        return { store, ok: true, giveaways: await storeFetchers[store](options) };
      } catch (error) {
        return { store, ok: false, error };
      }
    }),
  );

  const giveaways: StoreGiveaway[] = [];
  const failures: { store: StoreId; error: unknown }[] = [];
  for (const result of results) {
    if (result.ok) {
      for (const giveaway of result.giveaways) giveaways.push({ ...giveaway, store: result.store });
    } else {
      failures.push({ store: result.store, error: result.error });
    }
  }

  if (failures.length === STORE_IDS.length) {
    // The module's .onError logs this throw exactly once — no logging here.
    throw new UpstreamError("all stores", "all store fetches failed", {
      cause: new AggregateError(failures.map((failure) => failure.error)),
    });
  }
  for (const failure of failures) {
    logger.error({ store: failure.store, err: failure.error }, "upstream fetch failed");
  }

  return {
    count: giveaways.length,
    giveaways,
    errors: failures.map((failure) => ({
      store: failure.store,
      error: `Failed to fetch giveaways from ${failure.store}`,
    })),
  };
}

/** Store-declaration order first (matches the live aggregate), then id, for a stable envelope. */
function byStoreThenId(a: StoreGiveaway, b: StoreGiveaway): number {
  return STORE_IDS.indexOf(a.store) - STORE_IDS.indexOf(b.store) || a.id.localeCompare(b.id);
}

/**
 * Serves the aggregate from the cache. Active cached rows are returned directly (the hot path, one query);
 * when none are active, a refresh marker disambiguates "refreshed but nothing free right now" (empty result)
 * from "never refreshed" (fall back to a live upstream fetch).
 */
export async function getAllFreeGamesCached(
  db: Database,
  options: { locale: string; country: string },
): Promise<AllGiveawaysResponse> {
  const rows = await findActiveGiveaways(db, options);
  if (rows.length > 0) {
    return {
      count: rows.length,
      giveaways: rows.map(toStoreGiveaway).toSorted(byStoreThenId),
      errors: [],
    };
  }
  if (await isRefreshed(db, options)) return { count: 0, giveaways: [], errors: [] };
  return getAllFreeGames(options);
}

/** Per-store equivalent of {@link getAllFreeGamesCached}; only a never-refreshed store falls back to live. */
export async function getStoreFreeGamesCached<Store extends StoreId>(
  db: Database,
  store: Store,
  options: { locale: string; country: string },
): Promise<{ store: Store; count: number; giveaways: Giveaway[] }> {
  const rows = await findActiveGiveaways(db, { ...options, store });
  if (rows.length > 0) {
    const giveaways = rows.map(toGiveaway).toSorted((a, b) => a.id.localeCompare(b.id));
    return { store, count: giveaways.length, giveaways };
  }
  if (await isRefreshed(db, { ...options, store })) return { store, count: 0, giveaways: [] };
  const giveaways = await storeFetchers[store](options);
  return { store, count: giveaways.length, giveaways };
}

/** Successful stores (those not in `errors`) with their giveaway counts, in store-declaration order. */
function countsByStore(result: AllGiveawaysResponse): { store: StoreId; count: number }[] {
  const errored = new Set(result.errors.map((entry) => entry.store));
  const counts = new Map<StoreId, number>();
  for (const giveaway of result.giveaways) {
    counts.set(giveaway.store, (counts.get(giveaway.store) ?? 0) + 1);
  }
  return STORE_IDS.filter((store) => !errored.has(store)).map((store) => ({
    store,
    count: counts.get(store) ?? 0,
  }));
}

/**
 * Refreshes the cache for every market in {@link REFRESH_LOCALES}: fetches live giveaways, upserts them, and
 * records which stores were refreshed. Upstream and database failures are handled differently on purpose:
 *
 * - An all-stores-upstream failure for one market is recorded in that market's `errors` and skipped — it is
 *   expected/transient and never wipes existing rows (upsert-only, no deletes).
 * - A database write failure is infrastructure-level: it propagates so the caller returns a non-2xx status,
 *   rather than being silently mislabeled as an upstream failure behind a 200.
 *
 * This is the non-HTTP entry point for the cron route.
 */
export async function refreshCache(db: Database): Promise<RefreshSummaryResponse> {
  const startedAt = new Date().toISOString();
  const markets: RefreshSummaryResponse["markets"] = [];
  let totalUpserted = 0;

  for (const { locale, country } of REFRESH_LOCALES) {
    let result: AllGiveawaysResponse;
    try {
      result = await getAllFreeGames({ locale, country });
    } catch (error) {
      // getAllFreeGames throws only when every store failed upstream for this market; record and move on.
      logger.error({ locale, country, err: error }, "cache refresh: all stores failed upstream");
      markets.push({
        locale,
        country,
        upserted: 0,
        stores: [],
        errors: STORE_IDS.map((store) => ({
          store,
          error: `Failed to fetch giveaways from ${store}`,
        })),
      });
      continue;
    }

    // A DB write failure below is intentionally NOT caught — it must surface as a non-2xx, not be attributed
    // to the (successful) upstreams.
    const stores = countsByStore(result);
    const upserted = await upsertGiveaways(db, { locale, country }, result.giveaways);
    await markStoresRefreshed(
      db,
      { locale, country },
      stores.map((entry) => entry.store),
    );
    totalUpserted += upserted;
    markets.push({ locale, country, upserted, stores, errors: result.errors });
  }

  return { startedAt, finishedAt: new Date().toISOString(), totalUpserted, markets };
}
