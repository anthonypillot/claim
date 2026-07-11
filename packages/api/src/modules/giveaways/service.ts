import type { Database } from "../../db/client.ts";
import { logger } from "../../utils/logger.ts";
import type {
  AllGiveawaysResponse,
  EpicGamesGiveawaysResponse,
  Giveaway,
  GogGiveawaysResponse,
  PrimeGamingGiveawaysResponse,
  SteamGiveawaysResponse,
  StoreGiveaway,
  StoreId,
} from "./model.ts";
import { STORE_IDS } from "./model.ts";
import {
  findActiveGiveaways,
  isFresh,
  isMarketFresh,
  markFetched,
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
 * Read-through aggregate cache. When every store was fetched within the TTL, serve the active cached rows
 * (`free_until > now()`); otherwise fetch live, write the result to the cache, and serve it. Only the stores
 * that succeeded are cached and marked fresh, so a still-failing store is retried on the next request.
 */
export async function getAllFreeGamesCached(
  db: Database,
  options: { locale: string; country: string },
): Promise<AllGiveawaysResponse> {
  if (await isMarketFresh(db, options)) {
    const giveaways = (await findActiveGiveaways(db, options))
      .map(toStoreGiveaway)
      .toSorted(byStoreThenId);
    return { count: giveaways.length, giveaways, errors: [] };
  }

  const result = await getAllFreeGames(options);
  await upsertGiveaways(db, options, result.giveaways);
  const succeeded = STORE_IDS.filter(
    (store) => !result.errors.some((entry) => entry.store === store),
  );
  await markFetched(db, options, succeeded);
  return result;
}

/** Read-through per-store cache; a stale/uncached store is fetched live, written, and served. */
export async function getStoreFreeGamesCached<Store extends StoreId>(
  db: Database,
  store: Store,
  options: { locale: string; country: string },
): Promise<{ store: Store; count: number; giveaways: Giveaway[] }> {
  if (await isFresh(db, { ...options, store })) {
    const rows = await findActiveGiveaways(db, { ...options, store });
    const giveaways = rows.map(toGiveaway).toSorted((a, b) => a.id.localeCompare(b.id));
    return { store, count: giveaways.length, giveaways };
  }

  const giveaways = await storeFetchers[store](options);
  await upsertGiveaways(
    db,
    options,
    giveaways.map((giveaway) => ({ ...giveaway, store })),
  );
  await markFetched(db, options, [store]);
  return { store, count: giveaways.length, giveaways };
}
