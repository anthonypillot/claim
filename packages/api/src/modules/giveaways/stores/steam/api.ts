import { createLogger } from "../../../../utils/logger.ts";
import { isRecord, UpstreamError } from "../shared.ts";
import type { SteamCandidate, SteamFeaturedItem, SteamStoreItem } from "./types.ts";

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
async function fetchJson(url: URL): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new UpstreamError(STORE, `upstream returned ${response.status}`);
    }
    return await response.json();
  } catch (cause) {
    if (cause instanceof UpstreamError) throw cause;
    throw new UpstreamError(STORE, "upstream request failed", { cause });
  }
}

function isFeaturedItem(value: unknown): value is SteamFeaturedItem {
  return (
    isRecord(value) &&
    typeof value["id"] === "number" &&
    (value["name"] === undefined || typeof value["name"] === "string") &&
    (value["discount_percent"] === undefined || typeof value["discount_percent"] === "number") &&
    (value["original_price"] == null || typeof value["original_price"] === "number") &&
    (value["final_price"] === undefined || typeof value["final_price"] === "number") &&
    (value["currency"] === undefined || typeof value["currency"] === "string") &&
    (value["header_image"] == null || typeof value["header_image"] === "string") &&
    (value["small_capsule_image"] == null || typeof value["small_capsule_image"] === "string")
  );
}

function isStoreItem(value: unknown): value is SteamStoreItem {
  if (!isRecord(value) || typeof value["appid"] !== "number") return false;
  if (value["name"] !== undefined && typeof value["name"] !== "string") return false;
  if (value["is_free"] !== undefined && typeof value["is_free"] !== "boolean") return false;
  if (value["store_url_path"] !== undefined && typeof value["store_url_path"] !== "string") {
    return false;
  }
  const option = value["best_purchase_option"];
  if (option == null) return true;
  if (!isRecord(option)) return false;
  if (option["discount_pct"] !== undefined && typeof option["discount_pct"] !== "number") {
    return false;
  }
  if (
    option["final_price_in_cents"] !== undefined &&
    typeof option["final_price_in_cents"] !== "string"
  ) {
    return false;
  }
  if (
    option["formatted_original_price"] !== undefined &&
    typeof option["formatted_original_price"] !== "string"
  ) {
    return false;
  }
  const discounts = option["active_discounts"];
  return (
    discounts === undefined ||
    (Array.isArray(discounts) &&
      discounts.every(
        (discount) =>
          isRecord(discount) &&
          (discount["discount_end_date"] === undefined ||
            typeof discount["discount_end_date"] === "number"),
      ))
  );
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
  const featured = await fetchJson(featuredUrl);

  const specialsGroup = isRecord(featured) ? featured["specials"] : undefined;
  const specials = isRecord(specialsGroup) ? specialsGroup["items"] : undefined;
  if (!Array.isArray(specials) || !specials.every(isFeaturedItem)) {
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
  const enriched = await fetchJson(itemsUrl);

  const enrichedResponse = isRecord(enriched) ? enriched["response"] : undefined;
  const storeItems = isRecord(enrichedResponse) ? enrichedResponse["store_items"] : undefined;
  if (!Array.isArray(storeItems) || !storeItems.every(isStoreItem)) {
    throw new UpstreamError(STORE, "unexpected upstream response shape");
  }

  const byAppid = new Map(storeItems.map((item) => [item.appid, item] as const));
  return candidates.map((item) => ({ featured: item, confirm: byAppid.get(item.id) }));
}
