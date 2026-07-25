import { dev } from "$app/environment";
import type { GiveawaysResponse } from "$lib/giveaways/model";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
  const endpoint = dev ? "/api/giveaways" : "https://api.claim.anthonypillot.fr/giveaways";
  const response = await fetch(endpoint);

  if (!response.ok) {
    error(502, "Unable to fetch giveaways");
  }

  const items: GiveawaysResponse = await response.json();
  return { items };
};
