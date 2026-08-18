import { createLogger } from "../../utils/logger.ts";
import type { ResolveGiveawayCacheScope } from "./cache-scope.ts";
import type { AllGiveawaysResponse, Giveaway, Market, StoreGiveaway, StoreId } from "./model.ts";
import { STORE_IDS } from "./model.ts";
import { UpstreamError } from "./stores/shared.ts";

const log = createLogger("giveaway reads");

export type GiveawayReads = {
  getAll: (market: Market) => Promise<AllGiveawaysResponse>;
  getStore: <Store extends StoreId>(
    store: Store,
    market: Market,
  ) => Promise<{ store: Store; count: number; giveaways: Giveaway[] }>;
};

function byStoreThenId(a: StoreGiveaway, b: StoreGiveaway): number {
  return STORE_IDS.indexOf(a.store) - STORE_IDS.indexOf(b.store) || a.id.localeCompare(b.id);
}

export function createGiveawayReads(resolveScope: ResolveGiveawayCacheScope): GiveawayReads {
  return {
    async getAll(market): Promise<AllGiveawaysResponse> {
      const resolutions = await Promise.all(
        STORE_IDS.map(async (store) => ({ store, resolution: await resolveScope(store, market) })),
      );
      const usable = resolutions.filter(
        ({ resolution }) => resolution.availability !== "unavailable",
      );

      if (usable.length === 0) {
        throw new UpstreamError("all stores", "all store fetches failed", {
          cause: new AggregateError([]),
        });
      }

      const giveaways = usable
        .flatMap(({ store, resolution }) =>
          resolution.giveaways.map((giveaway) => ({ ...giveaway, store })),
        )
        .toSorted(byStoreThenId);
      const degraded = resolutions.filter(
        ({ resolution }) => resolution.availability !== "available",
      );

      log.debug(
        {
          ...market,
          count: giveaways.length,
          degraded: degraded.map(({ store }) => store),
        },
        "serving aggregate cache",
      );
      return {
        count: giveaways.length,
        giveaways,
        errors: degraded.map(({ store }) => ({
          store,
          error: `Failed to fetch giveaways from ${store}`,
        })),
      };
    },

    async getStore<Store extends StoreId>(
      store: Store,
      market: Market,
    ): Promise<{ store: Store; count: number; giveaways: Giveaway[] }> {
      const resolution = await resolveScope(store, market);
      if (resolution.availability === "unavailable") {
        throw new UpstreamError(store, "store refresh failed");
      }
      const giveaways = [...resolution.giveaways].toSorted((a, b) => a.id.localeCompare(b.id));
      log.debug({ store, ...market, count: giveaways.length }, "serving store cache");
      return { store, count: giveaways.length, giveaways };
    },
  };
}
