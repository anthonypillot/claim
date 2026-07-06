import type { EpicGamesGiveawaysResponse, PrimeGamingGiveawaysResponse } from "./model.ts";
import { fetchFreeGames as fetchEpicGamesGiveaways } from "./stores/epic-games/index.ts";
import { fetchFreeGames as fetchPrimeGamingGiveaways } from "./stores/prime-gaming/index.ts";

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
