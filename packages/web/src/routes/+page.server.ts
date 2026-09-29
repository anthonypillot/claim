import { fetchGiveaways } from "$lib/server/giveaways";
import { getLocale } from "$lib/paraglide/runtime";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
  const items = await fetchGiveaways(fetch, getLocale());
  return { items, loadedAt: Date.now() };
};
