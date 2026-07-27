import type { Database } from "../../db/client.ts";
import { createLogger } from "../../utils/logger.ts";
import type { AllGiveawaysResponse, Giveaway, StoreGiveaway, StoreId } from "./model.ts";
import { STORE_IDS } from "./model.ts";
import {
  acquireRefreshLease,
  findActiveGiveaways,
  hasSuccessfulSnapshot,
  isFresh,
  isInFailureCooldown,
  recordRefreshFailure,
  refreshStore,
  toGiveaway,
  toStoreGiveaway,
} from "./repository.ts";
import { fetchFreeGames as fetchEpicGamesGiveaways } from "./stores/epic-games/index.ts";
import { fetchFreeGames as fetchGogGiveaways } from "./stores/gog/index.ts";
import { fetchFreeGames as fetchPrimeGamingGiveaways } from "./stores/prime-gaming/index.ts";
import type { FetchFreeGames } from "./stores/shared.ts";
import { UpstreamError } from "./stores/shared.ts";
import { fetchFreeGames as fetchSteamGiveaways } from "./stores/steam/index.ts";

const log = createLogger("giveaways service");

// Adding a store id to STORE_IDS is a compile error until its fetcher is registered here.
const storeFetchers = {
  "epic-games": fetchEpicGamesGiveaways,
  "prime-gaming": fetchPrimeGamingGiveaways,
  gog: fetchGogGiveaways,
  steam: fetchSteamGiveaways,
} as const satisfies Record<StoreId, FetchFreeGames>;

type RefreshStatus = "fresh" | "refreshed" | "degraded" | "unavailable";
type RefreshResult = { store: StoreId; status: RefreshStatus };

const refreshesByDatabase = new WeakMap<Database, Map<string, Promise<RefreshResult>>>();

function scopeKey(store: StoreId, options: { locale: string; country: string }): string {
  return `${store}\0${options.locale}\0${options.country}`;
}

async function refreshScope(
  db: Database,
  store: StoreId,
  options: { locale: string; country: string },
): Promise<RefreshResult> {
  const scope = { ...options, store };
  if (await isFresh(db, scope)) return { store, status: "fresh" };

  const leaseToken = await acquireRefreshLease(db, scope);
  if (leaseToken === null) {
    if (await isFresh(db, scope)) return { store, status: "fresh" };
    const hasSnapshot = await hasSuccessfulSnapshot(db, scope);
    const inCooldown = await isInFailureCooldown(db, scope);
    log.debug({ store, ...options, hasSnapshot, inCooldown }, "refresh deferred");
    return { store, status: hasSnapshot ? "degraded" : "unavailable" };
  }

  log.debug({ store, ...options }, "store stale, fetching live");
  let live: Giveaway[];
  try {
    live = await storeFetchers[store](options);
  } catch (error) {
    await recordRefreshFailure(db, scope, leaseToken);
    log.error({ store, ...options, err: error }, "upstream fetch failed");
    return {
      store,
      status: (await hasSuccessfulSnapshot(db, scope)) ? "degraded" : "unavailable",
    };
  }

  const written = await refreshStore(db, options, store, live, leaseToken);
  if (written === null) {
    return {
      store,
      status: (await hasSuccessfulSnapshot(db, scope)) ? "degraded" : "unavailable",
    };
  }
  log.info({ store, ...options, count: written }, "cached live store giveaways");
  return { store, status: "refreshed" };
}

/** Shares one refresh promise for a cache scope between aggregate and per-store requests. */
function coordinateRefresh(
  db: Database,
  store: StoreId,
  options: { locale: string; country: string },
): Promise<RefreshResult> {
  let refreshes = refreshesByDatabase.get(db);
  if (refreshes === undefined) {
    refreshes = new Map();
    refreshesByDatabase.set(db, refreshes);
  }
  const key = scopeKey(store, options);
  const existing = refreshes.get(key);
  if (existing) return existing;

  const refresh = refreshScope(db, store, options).finally(() => {
    if (refreshes.get(key) === refresh) refreshes.delete(key);
  });
  refreshes.set(key, refresh);
  return refresh;
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
  const results = await Promise.all(
    STORE_IDS.map((store) => coordinateRefresh(db, store, options)),
  );
  const availableStores = new Set(
    results.filter((result) => result.status !== "unavailable").map((result) => result.store),
  );
  const degradedStores = results.filter(
    (result) => result.status === "degraded" || result.status === "unavailable",
  );

  if (availableStores.size === 0) {
    throw new UpstreamError("all stores", "all store fetches failed", {
      cause: new AggregateError([]),
    });
  }

  const giveaways = (await findActiveGiveaways(db, options))
    .map(toStoreGiveaway)
    .filter((giveaway) => availableStores.has(giveaway.store))
    .toSorted(byStoreThenId);
  log.debug(
    {
      ...options,
      count: giveaways.length,
      refreshed: results
        .filter((result) => result.status === "refreshed")
        .map((result) => result.store),
      degraded: degradedStores.map((result) => result.store),
    },
    "serving aggregate cache",
  );
  return {
    count: giveaways.length,
    giveaways,
    errors: degradedStores.map((result) => ({
      store: result.store,
      error: `Failed to fetch giveaways from ${result.store}`,
    })),
  };
}

/** Read-through per-store cache; a stale/uncached store is fetched live, written, and served. */
export async function getStoreFreeGamesCached<Store extends StoreId>(
  db: Database,
  store: Store,
  options: { locale: string; country: string },
): Promise<{ store: Store; count: number; giveaways: Giveaway[] }> {
  const result = await coordinateRefresh(db, store, options);
  if (result.status === "unavailable") throw new UpstreamError(store, "store refresh failed");
  const cached = (await findActiveGiveaways(db, { ...options, store }))
    .map(toGiveaway)
    .toSorted((a, b) => a.id.localeCompare(b.id));
  log.debug({ store, ...options, count: cached.length }, "serving store cache");
  return { store, count: cached.length, giveaways: cached };
}
