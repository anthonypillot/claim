import { Elysia } from "elysia";

import { logger } from "../../utils/logger.ts";
import {
  AllGiveawaysResponseSchema,
  EpicGamesGiveawaysResponseSchema,
  ErrorResponseSchema,
  GiveawaysQuerySchema,
  GogGiveawaysResponseSchema,
  PrimeGamingGiveawaysResponseSchema,
  SteamGiveawaysResponseSchema,
} from "./model.ts";
import {
  getAllFreeGames,
  getEpicGamesFreeGames,
  getGogFreeGames,
  getPrimeGamingFreeGames,
  getSteamFreeGames,
} from "./service.ts";
import { UpstreamError } from "./stores/shared.ts";

export const giveaways = new Elysia({ prefix: "/giveaways" })
  .error({ UPSTREAM_ERROR: UpstreamError })
  .onError(({ code, error, status }) => {
    if (code === "UPSTREAM_ERROR") {
      logger.error({ store: error.store, err: error }, "upstream fetch failed");
      return status(502, { error: `Failed to fetch giveaways from ${error.store}` });
    }
  })
  .get("/", ({ query }) => getAllFreeGames(query), {
    query: GiveawaysQuerySchema,
    response: { 200: AllGiveawaysResponseSchema, 502: ErrorResponseSchema },
    detail: { summary: "List currently-free giveaways across all stores", tags: ["giveaways"] },
  })
  .get("/epic-games", ({ query }) => getEpicGamesFreeGames(query), {
    query: GiveawaysQuerySchema,
    response: { 200: EpicGamesGiveawaysResponseSchema, 502: ErrorResponseSchema },
    detail: { summary: "List currently-free Epic Games giveaways", tags: ["giveaways"] },
  })
  .get("/prime-gaming", ({ query }) => getPrimeGamingFreeGames(query), {
    query: GiveawaysQuerySchema,
    response: { 200: PrimeGamingGiveawaysResponseSchema, 502: ErrorResponseSchema },
    detail: { summary: "List currently-free Prime Gaming full games", tags: ["giveaways"] },
  })
  .get("/gog", ({ query }) => getGogFreeGames(query), {
    query: GiveawaysQuerySchema,
    response: { 200: GogGiveawaysResponseSchema, 502: ErrorResponseSchema },
    detail: { summary: "List currently-free GOG giveaways", tags: ["giveaways"] },
  })
  .get("/steam", ({ query }) => getSteamFreeGames(query), {
    query: GiveawaysQuerySchema,
    response: { 200: SteamGiveawaysResponseSchema, 502: ErrorResponseSchema },
    detail: { summary: "List currently-free Steam giveaways", tags: ["giveaways"] },
  });
