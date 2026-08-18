import { Elysia } from "elysia";

import { getDb } from "../../db/client.ts";
import { createLogger } from "../../utils/logger.ts";
import { createGiveawayCacheScopeResolver } from "./cache-scope.ts";
import {
  AllGiveawaysResponseSchema,
  createGiveawaysResponseSchema,
  ErrorResponseSchema,
  GiveawaysQuerySchema,
  resolveMarket,
  type StoreId,
  UnsupportedMarketError,
} from "./model.ts";
import { createGiveawayReads, type GiveawayReads } from "./read.ts";
import { storeAdapters } from "./stores/index.ts";
import { UpstreamError } from "./stores/shared.ts";

const log = createLogger("giveaways routes");

type StoreGiveawaysRoute<Store extends StoreId> = {
  store: Store;
  path: `/${Store}`;
  summary: string;
};

function createStoreGiveawaysRoute<const Store extends StoreId>(
  reads: GiveawayReads,
  route: StoreGiveawaysRoute<Store>,
) {
  return new Elysia().get(
    route.path,
    ({ query }) => reads.getStore(route.store, resolveMarket(query)),
    {
      query: GiveawaysQuerySchema,
      response: {
        200: createGiveawaysResponseSchema(route.store),
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
        502: ErrorResponseSchema,
      },
      detail: { summary: route.summary, tags: ["giveaways"] },
    },
  );
}

/**
 * The giveaways plugin. Its read module is replaceable so route tests exercise the same seam as callers.
 */
export function createGiveaways(reads: GiveawayReads = createDefaultGiveawayReads()) {
  return new Elysia({ prefix: "/giveaways" })
    .error({ UPSTREAM_ERROR: UpstreamError })
    .error({ UNSUPPORTED_MARKET: UnsupportedMarketError })
    .onError(({ code, error, status }) => {
      if (code === "UPSTREAM_ERROR") {
        log.error({ store: error.store, err: error }, "upstream fetch failed");
        return status(502, { error: `Failed to fetch giveaways from ${error.store}` });
      }
      if (code === "UNSUPPORTED_MARKET") {
        return status(422, { error: error.message });
      }
      if (code === "VALIDATION") {
        if (error.type === "response") {
          log.error({ err: error }, "response validation failed");
          return status(500, { error: "Internal server error" });
        }
        return status(422, { error: "Invalid request" });
      }
      if (code === "UNKNOWN") {
        log.error({ err: error }, "request failed");
        return status(500, { error: "Internal server error" });
      }
    })

    .get("", ({ query }) => reads.getAll(resolveMarket(query)), {
      query: GiveawaysQuerySchema,
      response: {
        200: AllGiveawaysResponseSchema,
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
        502: ErrorResponseSchema,
      },
      detail: { summary: "List currently-free giveaways across all stores", tags: ["giveaways"] },
    })

    .use(
      createStoreGiveawaysRoute(reads, {
        store: "epic-games",
        path: "/epic-games",
        summary: "List currently-free Epic Games giveaways",
      }),
    )
    .use(
      createStoreGiveawaysRoute(reads, {
        store: "prime-gaming",
        path: "/prime-gaming",
        summary: "List currently-free Prime Gaming full games",
      }),
    )
    .use(
      createStoreGiveawaysRoute(reads, {
        store: "gog",
        path: "/gog",
        summary: "List currently-free GOG giveaways",
      }),
    )
    .use(
      createStoreGiveawaysRoute(reads, {
        store: "steam",
        path: "/steam",
        summary: "List currently-free Steam giveaways",
      }),
    );
}

function createDefaultGiveawayReads(): GiveawayReads {
  return createGiveawayReads(createGiveawayCacheScopeResolver(getDb, storeAdapters));
}
