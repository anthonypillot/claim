import { UpstreamError } from "../shared.ts";
import type { EpicFreeGamesResponse, EpicOffer } from "./types.ts";

const EPIC_URL = "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions";

/** Raw upstream access: returns every offer Epic lists, unfiltered. */
export async function fetchFreeGamesPromotions(options: {
  locale: string;
  country: string;
}): Promise<EpicOffer[]> {
  const url = new URL(EPIC_URL);
  url.searchParams.set("locale", options.locale);
  url.searchParams.set("country", options.country.toUpperCase());
  url.searchParams.set("allowCountries", options.country.toUpperCase());

  let body: EpicFreeGamesResponse;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new UpstreamError("epic-games", `upstream returned ${response.status}`);
    }
    body = (await response.json()) as EpicFreeGamesResponse;
  } catch (cause) {
    if (cause instanceof UpstreamError) throw cause;
    throw new UpstreamError("epic-games", "upstream request failed", { cause });
  }

  const elements = body.data?.Catalog?.searchStore?.elements;
  if (!Array.isArray(elements)) {
    throw new UpstreamError("epic-games", "unexpected upstream response shape");
  }

  return elements;
}
