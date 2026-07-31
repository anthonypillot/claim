import { Elysia } from "elysia";

import type { Database } from "../../db/client.ts";
import { getDb } from "../../db/client.ts";
import { createLogger } from "../../utils/logger.ts";
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
import { getAllFreeGamesCached, getStoreFreeGamesCached } from "./service.ts";
import { UpstreamError } from "./stores/shared.ts";

const log = createLogger("giveaways routes");

/**
 * The giveaways plugin. `getDatabase` is injected (defaulting to the shared client) so tests can supply an
 * in-memory database; it is resolved per request and never at construction, keeping `buildApp` IO-free.
 */
export function createGiveaways(getDatabase: () => Database = getDb) {
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
    .get("", ({ query }) => getAllFreeGamesCached(getDatabase(), resolveMarket(query)), {
      query: GiveawaysQuerySchema,
      response: {
        200: AllGiveawaysResponseSchema,
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
        502: ErrorResponseSchema,
      },
      detail: { summary: "List currently-free giveaways across all stores", tags: ["giveaways"] },
    })
    .get(
      "/epic-games",
      ({ query }) => getStoreFreeGamesCached(getDatabase(), "epic-games", resolveMarket(query)),
      {
        query: GiveawaysQuerySchema,
        response: {
          200: EpicGamesGiveawaysResponseSchema,
          422: ErrorResponseSchema,
          500: ErrorResponseSchema,
          502: ErrorResponseSchema,
        },
        detail: { summary: "List currently-free Epic Games giveaways", tags: ["giveaways"] },
      },
    )
    .get(
      "/prime-gaming",
      ({ query }) => getStoreFreeGamesCached(getDatabase(), "prime-gaming", resolveMarket(query)),
      {
        query: GiveawaysQuerySchema,
        response: {
          200: PrimeGamingGiveawaysResponseSchema,
          422: ErrorResponseSchema,
          500: ErrorResponseSchema,
          502: ErrorResponseSchema,
        },
        detail: { summary: "List currently-free Prime Gaming full games", tags: ["giveaways"] },
      },
    )
    .get(
      "/gog",
      ({ query }) => getStoreFreeGamesCached(getDatabase(), "gog", resolveMarket(query)),
      {
        query: GiveawaysQuerySchema,
        response: {
          200: GogGiveawaysResponseSchema,
          422: ErrorResponseSchema,
          500: ErrorResponseSchema,
          502: ErrorResponseSchema,
        },
        detail: { summary: "List currently-free GOG giveaways", tags: ["giveaways"] },
      },
    )
    .get(
      "/steam",
      ({ query }) => getStoreFreeGamesCached(getDatabase(), "steam", resolveMarket(query)),
      {
        query: GiveawaysQuerySchema,
        response: {
          200: SteamGiveawaysResponseSchema,
          422: ErrorResponseSchema,
          500: ErrorResponseSchema,
          502: ErrorResponseSchema,
        },
        detail: { summary: "List currently-free Steam giveaways", tags: ["giveaways"] },
      },
    );
}
