import type { Giveaway } from "../../model.ts";
import type { FetchFreeGames } from "../shared.ts";
import { fetchFreeToKeep } from "./api.ts";
import { toGiveaways } from "./mapper.ts";

export async function fetchFreeGames(options: {
  locale: string;
  country: string;
}): Promise<Giveaway[]> {
  return toGiveaways(await fetchFreeToKeep(options));
}

// Compile-time check that this store conforms to the shared store contract.
fetchFreeGames satisfies FetchFreeGames;
