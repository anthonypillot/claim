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
  SteamGiveawaysResponseSchema,
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
    .onError(({ code, error, status }) => {
      if (code === "UPSTREAM_ERROR") {
        log.error({ store: error.store, err: error }, "upstream fetch failed");
        return status(502, { error: `Failed to fetch giveaways from ${error.store}` });
      }
    })
    .get("/", ({ query }) => getAllFreeGamesCached(getDatabase(), query), {
      query: GiveawaysQuerySchema,
      response: { 200: AllGiveawaysResponseSchema, 502: ErrorResponseSchema },
      detail: { summary: "List currently-free giveaways across all stores", tags: ["giveaways"] },
    })
    .get(
      "/epic-games",
      ({ query }) => getStoreFreeGamesCached(getDatabase(), "epic-games", query),
      {
        query: GiveawaysQuerySchema,
        response: { 200: EpicGamesGiveawaysResponseSchema, 502: ErrorResponseSchema },
        detail: { summary: "List currently-free Epic Games giveaways", tags: ["giveaways"] },
      },
    )
    .get(
      "/prime-gaming",
      ({ query }) => getStoreFreeGamesCached(getDatabase(), "prime-gaming", query),
      {
        query: GiveawaysQuerySchema,
        response: { 200: PrimeGamingGiveawaysResponseSchema, 502: ErrorResponseSchema },
        detail: { summary: "List currently-free Prime Gaming full games", tags: ["giveaways"] },
      },
    )
    .get("/gog", ({ query }) => getStoreFreeGamesCached(getDatabase(), "gog", query), {
      query: GiveawaysQuerySchema,
      response: { 200: GogGiveawaysResponseSchema, 502: ErrorResponseSchema },
      detail: { summary: "List currently-free GOG giveaways", tags: ["giveaways"] },
    })
    .get("/steam", ({ query }) => getStoreFreeGamesCached(getDatabase(), "steam", query), {
      query: GiveawaysQuerySchema,
      response: { 200: SteamGiveawaysResponseSchema, 502: ErrorResponseSchema },
      detail: { summary: "List currently-free Steam giveaways", tags: ["giveaways"] },
    });
}
