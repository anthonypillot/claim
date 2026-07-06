import type { Database } from "../../db/client.ts";
import { createLogger } from "../../utils/logger.ts";
import type { AllGiveawaysResponse, Giveaway, StoreGiveaway, StoreId } from "./model.ts";
import { STORE_IDS } from "./model.ts";
import {
  findActiveGiveaways,
  findFreshStoreIds,
  isFresh,
  refreshStore,
  toGiveaway,
  toStoreGiveaway,
} from "./repository.ts";
import { fetchFreeGames as fetchEpicGamesGiveaways } from "./stores/epic-games/index.ts";
import { fetchFreeGames as fetchGogGiveaways } from "./stores/gog/index.ts";
import { fetchFreeGames as fetchPrimeGamingGiveaways } from "./stores/prime-gaming/index.ts";
import { fetchFreeGames as fetchSteamGiveaways } from "./stores/steam/index.ts";
import type { FetchFreeGames } from "./stores/shared.ts";
import { UpstreamError } from "./stores/shared.ts";

const log = createLogger("giveaways service");

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

/** Fetches the requested stores concurrently and keeps failures isolated by store. */
async function fetchStores(
  stores: readonly StoreId[],
  options: { locale: string; country: string },
): Promise<StoreResult[]> {
  log.debug({ stores, ...options }, "fetching stores");
  return Promise.all(
    stores.map(async (store): Promise<StoreResult> => {
      try {
        return { store, ok: true, giveaways: await storeFetchers[store](options) };
      } catch (error) {
        return { store, ok: false, error };
      }
    }),
  );
}

/** Store-declaration order first (matches the live aggregate), then id, for a stable envelope. */
function byStoreThenId(a: StoreGiveaway, b: StoreGiveaway): number {
  return STORE_IDS.indexOf(a.store) - STORE_IDS.indexOf(b.store) || a.id.localeCompare(b.id);
}

/**
 * Read-through aggregate cache. Fresh stores stay cached while stale stores refresh independently, so one
 * failing upstream does not cause healthy stores to be fetched again.
 */
export async function getAllFreeGamesCached(
  db: Database,
  options: { locale: string; country: string },
): Promise<AllGiveawaysResponse> {
  const freshStores = await findFreshStoreIds(db, options);
  const staleStores = STORE_IDS.filter((store) => !freshStores.includes(store));
  const results = await fetchStores(staleStores, options);
  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);

  if (freshStores.length === 0 && successes.length === 0) {
    throw new UpstreamError("all stores", "all store fetches failed", {
      cause: new AggregateError(failures.map((failure) => failure.error)),
    });
  }

  await Promise.all(
    successes.map((result) => refreshStore(db, options, result.store, result.giveaways)),
  );
  for (const failure of failures) {
    log.error({ store: failure.store, err: failure.error }, "upstream fetch failed");
  }

  const availableStores = new Set<StoreId>([
    ...freshStores,
    ...successes.map((result) => result.store),
  ]);
  const giveaways = (await findActiveGiveaways(db, options))
    .map(toStoreGiveaway)
    .filter((giveaway) => availableStores.has(giveaway.store))
    .toSorted(byStoreThenId);
  log.debug(
    { ...options, count: giveaways.length, refreshed: successes.map((result) => result.store) },
    "serving aggregate cache",
  );
  return {
    count: giveaways.length,
    giveaways,
    errors: failures.map((failure) => ({
      store: failure.store,
      error: `Failed to fetch giveaways from ${failure.store}`,
    })),
  };
}

/** Read-through per-store cache; a stale/uncached store is fetched live, written, and served. */
export async function getStoreFreeGamesCached<Store extends StoreId>(
  db: Database,
  store: Store,
  options: { locale: string; country: string },
): Promise<{ store: Store; count: number; giveaways: Giveaway[] }> {
  if (!(await isFresh(db, { ...options, store }))) {
    log.debug({ store, ...options }, "store stale, fetching live");
    const live = await storeFetchers[store](options);
    await refreshStore(db, options, store, live);
    log.info({ store, ...options, count: live.length }, "cached live store giveaways");
  }
  const cached = (await findActiveGiveaways(db, { ...options, store }))
    .map(toGiveaway)
    .toSorted((a, b) => a.id.localeCompare(b.id));
  log.debug({ store, ...options, count: cached.length }, "serving store cache");
  return { store, count: cached.length, giveaways: cached };
}
