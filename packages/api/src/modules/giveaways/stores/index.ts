import type { StoreAdapters } from "../cache-scope.ts";
import { fetchFreeGames as fetchEpicGamesGiveaways } from "./epic-games/index.ts";
import { fetchFreeGames as fetchGogGiveaways } from "./gog/index.ts";
import { fetchFreeGames as fetchPrimeGamingGiveaways } from "./prime-gaming/index.ts";
import { fetchFreeGames as fetchSteamGiveaways } from "./steam/index.ts";

// Adding a store id is a compile error until its adapter is registered here.
export const storeAdapters = {
  "epic-games": fetchEpicGamesGiveaways,
  "prime-gaming": fetchPrimeGamingGiveaways,
  gog: fetchGogGiveaways,
  steam: fetchSteamGiveaways,
} as const satisfies StoreAdapters;
