import { Elysia } from "elysia";

import type { Database } from "../../db/client.ts";
import { getDb } from "../../db/client.ts";
import { createLogger } from "../../utils/logger.ts";
import { createGiveawayCacheScopeResolver } from "./cache-scope.ts";
import {
  AllGiveawaysResponseSchema,
  EpicGamesGiveawaysResponseSchema,
  ErrorResponseSchema,
  GiveawaysQuerySchema,
  GogGiveawaysResponseSchema,
  PrimeGamingGiveawaysResponseSchema,
  resolveMarket,
  SteamGiveawaysResponseSchema,
  UnsupportedMarketError,
} from "./model.ts";
import { createGiveawayReads, type GiveawayReads } from "./read.ts";
import { storeAdapters } from "./stores/index.ts";
import { UpstreamError } from "./stores/shared.ts";

const log = createLogger("giveaways routes");

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

    .get("/epic-games", ({ query }) => reads.getStore("epic-games", resolveMarket(query)), {
      query: GiveawaysQuerySchema,
      response: {
        200: EpicGamesGiveawaysResponseSchema,
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
        502: ErrorResponseSchema,
      },
      detail: { summary: "List currently-free Epic Games giveaways", tags: ["giveaways"] },
    })

    .get("/prime-gaming", ({ query }) => reads.getStore("prime-gaming", resolveMarket(query)), {
      query: GiveawaysQuerySchema,
      response: {
        200: PrimeGamingGiveawaysResponseSchema,
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
        502: ErrorResponseSchema,
      },
      detail: { summary: "List currently-free Prime Gaming full games", tags: ["giveaways"] },
    })

    .get("/gog", ({ query }) => reads.getStore("gog", resolveMarket(query)), {
      query: GiveawaysQuerySchema,
      response: {
        200: GogGiveawaysResponseSchema,
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
        502: ErrorResponseSchema,
      },
      detail: { summary: "List currently-free GOG giveaways", tags: ["giveaways"] },
    })

    .get("/steam", ({ query }) => reads.getStore("steam", resolveMarket(query)), {
      query: GiveawaysQuerySchema,
      response: {
        200: SteamGiveawaysResponseSchema,
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
        502: ErrorResponseSchema,
      },
      detail: { summary: "List currently-free Steam giveaways", tags: ["giveaways"] },
    });
}

export function createDefaultGiveawayReads(getDatabase: () => Database = getDb): GiveawayReads {
  return createGiveawayReads(createGiveawayCacheScopeResolver(getDatabase, storeAdapters));
}
