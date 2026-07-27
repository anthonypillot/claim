import { createLogger } from "../../../../utils/logger.ts";
import { isRecord, readUpstreamJson, UpstreamError } from "../shared.ts";
import type { EpicOffer } from "./types.ts";

const EPIC_URL = "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions";
const log = createLogger("epic games store");

function isEpicOffer(value: unknown): value is EpicOffer {
  if (!isRecord(value)) return false;
  if (
    typeof value["id"] !== "string" ||
    typeof value["title"] !== "string" ||
    typeof value["description"] !== "string" ||
    typeof value["offerType"] !== "string"
  ) {
    return false;
  }
  const keyImages = value["keyImages"];
  if (
    keyImages !== undefined &&
    (!Array.isArray(keyImages) ||
      !keyImages.every(
        (image) =>
          isRecord(image) && typeof image["type"] === "string" && typeof image["url"] === "string",
      ))
  ) {
    return false;
  }
  const seller = value["seller"];
  if (seller !== undefined && (!isRecord(seller) || typeof seller["name"] !== "string")) {
    return false;
  }
  const productSlug = value["productSlug"];
  if (productSlug != null && typeof productSlug !== "string") return false;
  const offerMappings = value["offerMappings"];
  if (
    offerMappings != null &&
    (!Array.isArray(offerMappings) ||
      !offerMappings.every(
        (mapping) => isRecord(mapping) && typeof mapping["pageSlug"] === "string",
      ))
  ) {
    return false;
  }
  const catalogNs = value["catalogNs"];
  if (catalogNs !== undefined) {
    if (!isRecord(catalogNs)) return false;
    const mappings = catalogNs["mappings"];
    if (
      mappings != null &&
      (!Array.isArray(mappings) ||
        !mappings.every((mapping) => isRecord(mapping) && typeof mapping["pageSlug"] === "string"))
    ) {
      return false;
    }
  }
  const price = value["price"];
  if (price !== undefined) {
    if (!isRecord(price)) return false;
    const totalPrice = price["totalPrice"];
    if (totalPrice !== undefined) {
      if (
        !isRecord(totalPrice) ||
        typeof totalPrice["discountPrice"] !== "number" ||
        typeof totalPrice["originalPrice"] !== "number" ||
        typeof totalPrice["currencyCode"] !== "string"
      ) {
        return false;
      }
      const formatted = totalPrice["fmtPrice"];
      if (
        formatted !== undefined &&
        (!isRecord(formatted) || typeof formatted["originalPrice"] !== "string")
      ) {
        return false;
      }
    }
  }
  const promotions = value["promotions"];
  if (promotions == null) return true;
  if (!isRecord(promotions)) return false;
  const groups = promotions["promotionalOffers"];
  return (
    groups === undefined ||
    (Array.isArray(groups) &&
      groups.every((group) => {
        if (!isRecord(group)) return false;
        const windows = group["promotionalOffers"];
        return (
          windows === undefined ||
          (Array.isArray(windows) &&
            windows.every(
              (window) =>
                isRecord(window) &&
                typeof window["startDate"] === "string" &&
                typeof window["endDate"] === "string",
            ))
        );
      }))
  );
}

/** Raw upstream access: returns every offer Epic lists, unfiltered. */
export async function fetchFreeGamesPromotions(options: {
  locale: string;
  country: string;
}): Promise<EpicOffer[]> {
  const url = new URL(EPIC_URL);
  url.searchParams.set("locale", options.locale);
  url.searchParams.set("country", options.country);
  url.searchParams.set("allowCountries", options.country);
  log.debug({ locale: options.locale, country: options.country }, "fetching free games");

  let body: unknown;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new UpstreamError("epic-games", `upstream returned ${response.status}`);
    }
    body = await readUpstreamJson(response, "epic-games");
  } catch (cause) {
    if (cause instanceof UpstreamError) throw cause;
    throw new UpstreamError("epic-games", "upstream request failed", { cause });
  }

  const data = isRecord(body) ? body["data"] : undefined;
  const catalog = isRecord(data) ? data["Catalog"] : undefined;
  const searchStore = isRecord(catalog) ? catalog["searchStore"] : undefined;
  const elements = isRecord(searchStore) ? searchStore["elements"] : undefined;
  if (!Array.isArray(elements) || !elements.every(isEpicOffer)) {
    throw new UpstreamError("epic-games", "unexpected upstream response shape");
  }

  log.debug({ count: elements.length }, "received offers");
  return elements;
}
