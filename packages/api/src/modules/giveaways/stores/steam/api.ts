import { createLogger } from "../../../../utils/logger.ts";
import { UpstreamError } from "../shared.ts";
import type {
  SteamCandidate,
  SteamFeaturedCategoriesResponse,
  SteamGetItemsResponse,
} from "./types.ts";

const log = createLogger("steam store");

// Steam has no giveaways API. Free-to-keep promos surface as 100%-off "specials": discover
// candidates from the store's featured-categories JSON, then confirm each via the store-browse
// service — the only public endpoint that exposes `is_free` and the discount end date.
const FEATURED_URL = "https://store.steampowered.com/api/featuredcategories";
const GET_ITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const STORE = "steam";

// Steam wants a language *name* ("english"), not a BCP 47 tag; fall back to English.
const STEAM_LANGUAGES: Record<string, string> = {
  en: "english",
  fr: "french",
  de: "german",
  es: "spanish",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
  pl: "polish",
  nl: "dutch",
  ja: "japanese",
  ko: "koreana",
  zh: "schinese",
};

function steamLanguage(locale: string): string {
  const language = locale.split("-")[0] ?? locale;
  return STEAM_LANGUAGES[language] ?? "english";
}

/** Both upstream calls share the same JSON GET shape — and the same error wrapping. */
async function fetchJson<T>(url: URL): Promise<T> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new UpstreamError(STORE, `upstream returned ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (cause) {
    if (cause instanceof UpstreamError) throw cause;
    throw new UpstreamError(STORE, "upstream request failed", { cause });
  }
}

/**
 * Raw upstream access: returns each currently-featured 100%-off special joined to its store-browse
 * confirmation. `locale` drives the response language (mapped to a Steam language name) and
 * `country` drives regional pricing/availability — both discounts and free-to-keep offers are
 * region-specific. The confirm call is skipped when no special is free-to-keep.
 */
export async function fetchFreeToKeep(options: {
  locale: string;
  country: string;
}): Promise<SteamCandidate[]> {
  const language = steamLanguage(options.locale);
  log.debug({ locale: options.locale, country: options.country }, "fetching free games");

  const featuredUrl = new URL(FEATURED_URL);
  featuredUrl.searchParams.set("cc", options.country);
  featuredUrl.searchParams.set("l", language);
  const featured = await fetchJson<SteamFeaturedCategoriesResponse>(featuredUrl);

  const specials = featured.specials?.items;
  if (!Array.isArray(specials)) {
    throw new UpstreamError(STORE, "unexpected upstream response shape");
  }

  // 100% off with a zero final price is the free-to-keep signal; permanently free-to-play games
  // carry no discount and never match. `is_free` is confirmed per app below.
  const candidates = specials.filter(
    (item) => item.discount_percent === 100 && item.final_price === 0,
  );
  log.debug({ count: candidates.length }, "received free-to-keep candidates");
  if (candidates.length === 0) return [];

  const itemsUrl = new URL(GET_ITEMS_URL);
  itemsUrl.searchParams.set(
    "input_json",
    JSON.stringify({
      ids: candidates.map((item) => ({ appid: item.id })),
      context: { language, country_code: options.country },
      data_request: { include_all_purchase_options: true, include_assets: true },
    }),
  );
  const enriched = await fetchJson<SteamGetItemsResponse>(itemsUrl);

  const storeItems = enriched.response?.store_items;
  if (!Array.isArray(storeItems)) {
    throw new UpstreamError(STORE, "unexpected upstream response shape");
  }

  const byAppid = new Map(storeItems.map((item) => [item.appid, item] as const));
  return candidates.map((item) => ({ featured: item, confirm: byAppid.get(item.id) }));
}
