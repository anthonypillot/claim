import { logger } from "../../utils/logger.ts";
import type {
  AllGiveawaysResponse,
  EpicGamesGiveawaysResponse,
  Giveaway,
  PrimeGamingGiveawaysResponse,
  StoreGiveaway,
  StoreId,
} from "./model.ts";
import { STORE_IDS } from "./model.ts";
import { fetchFreeGames as fetchEpicGamesGiveaways } from "./stores/epic-games/index.ts";
import { fetchFreeGames as fetchPrimeGamingGiveaways } from "./stores/prime-gaming/index.ts";
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

// Adding a store id to STORE_IDS is a compile error until its fetcher is registered here.
const storeFetchers = {
  "epic-games": fetchEpicGamesGiveaways,
  "prime-gaming": fetchPrimeGamingGiveaways,
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
