import { Elysia, t } from "elysia";

import { requireRefreshToken } from "../../config.ts";
import type { Database } from "../../database/client.ts";
import { getDb } from "../../database/client.ts";
import { logger } from "../../utils/logger.ts";
import {
  AllGiveawaysResponseSchema,
  EpicGamesGiveawaysResponseSchema,
  ErrorResponseSchema,
  GiveawaysQuerySchema,
  GogGiveawaysResponseSchema,
  PrimeGamingGiveawaysResponseSchema,
  RefreshSummaryResponseSchema,
  SteamGiveawaysResponseSchema,
} from "./model.ts";
import { getAllFreeGamesCached, getStoreFreeGamesCached, refreshCache } from "./service.ts";
import { UpstreamError } from "./stores/shared.ts";

const RefreshHeadersSchema = t.Object({
  "x-refresh-token": t.Optional(t.String({ description: "Shared secret guarding this endpoint" })),
});

/**
 * The giveaways plugin. `getDatabase` is injected (defaulting to the shared client) so tests can supply an
 * in-memory database; it is resolved per request and never at construction, keeping `buildApp` IO-free.
 */
export function createGiveaways(getDatabase: () => Database = getDb) {
  return new Elysia({ prefix: "/giveaways" })
    .error({ UPSTREAM_ERROR: UpstreamError })
    .onError(({ code, error, status }) => {
      if (code === "UPSTREAM_ERROR") {
        logger.error({ store: error.store, err: error }, "upstream fetch failed");
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
    })
    .post("/refresh", () => refreshCache(getDatabase()), {
      headers: RefreshHeadersSchema,
      // Optional header + a manual check keeps the OpenAPI spec clean and returns a consistent 401 for both
      // a missing and a mismatched token (a required header would yield 422 on absence instead).
      beforeHandle({ headers, status }) {
        if (headers["x-refresh-token"] !== requireRefreshToken()) {
          return status(401, { error: "Unauthorized" });
        }
      },
      response: { 200: RefreshSummaryResponseSchema, 401: ErrorResponseSchema },
      detail: {
        summary: "Refresh the giveaways cache from every store (cron-triggered)",
        tags: ["giveaways"],
      },
    });
}
