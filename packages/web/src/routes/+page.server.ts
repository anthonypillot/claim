import { getApiUrl } from "$lib/config";
import type { GiveawaysResponse } from "$lib/giveaways/model";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
  const response = await fetch(getApiUrl("/giveaways"));

  if (!response.ok) {
    error(502, "Unable to fetch giveaways");
  }

  const items: GiveawaysResponse = await response.json();
  return { items };
};
