import type { GiveawaysResponse } from "./model.ts";
import { fetchFreeGames } from "./stores/epic-games/index.ts";

/** Non-HTTP entry point to the feature (reused later by e.g. the notifications digest). */
export async function getEpicGamesFreeGames(options: {
  locale: string;
  country: string;
}): Promise<GiveawaysResponse> {
  const giveaways = await fetchFreeGames(options);
  return { store: "epic-games", count: giveaways.length, giveaways };
}
