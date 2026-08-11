import { fetchGiveaways } from "$lib/server/giveaways";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
  const items = await fetchGiveaways(fetch);
  return { items, loadedAt: Date.now() };
};
