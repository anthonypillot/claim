import type { Giveaway } from "../../model.ts";
import type { FetchFreeGames } from "../shared.ts";
import { fetchGiveawaySections } from "./api.ts";
import { toGiveaways } from "./mapper.ts";

export async function fetchFreeGames(options: {
  locale: string;
  country: string;
}): Promise<Giveaway[]> {
  return toGiveaways(await fetchGiveawaySections(options), options.locale);
}

// Compile-time check that this store conforms to the shared store contract.
fetchFreeGames satisfies FetchFreeGames;
