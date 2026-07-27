import { createLogger } from "../../../../utils/logger.ts";
import { isRecord, readUpstreamJson, UpstreamError } from "../shared.ts";
import type { GogGiveawaySection } from "./types.ts";

const log = createLogger("gog store");

// GOG giveaways only surface as a banner on the store home page; `2f` is that page's id in the
// unauthenticated sections API backing it. No GIVEAWAY_SECTION means no giveaway is running.
const GOG_PAGE_URL = "https://sections.gog.com/v1/pages/2f";
const GIVEAWAY_SECTION_TYPE = "GIVEAWAY_SECTION";
const STORE = "gog";

/** Both upstream calls share the same JSON GET shape — and the same error wrapping. */
async function fetchJson(url: URL): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new UpstreamError(STORE, `upstream returned ${response.status}`);
    }
    return await readUpstreamJson(response, STORE);
  } catch (cause) {
    if (cause instanceof UpstreamError) throw cause;
    throw new UpstreamError(STORE, "upstream request failed", { cause });
  }
}

function isSection(value: unknown): value is { sectionId?: string; sectionType?: string } {
  return (
    isRecord(value) &&
    (value["sectionId"] === undefined || typeof value["sectionId"] === "string") &&
    (value["sectionType"] === undefined || typeof value["sectionType"] === "string")
  );
}

function isGiveawaySection(value: unknown): value is GogGiveawaySection {
  if (!isRecord(value)) return false;
  const properties = value["properties"];
  if (properties == null) return true;
  if (!isRecord(properties)) return false;
  const endDate = properties["endDate"];
  if (endDate != null && typeof endDate !== "string") return false;
  const product = properties["product"];
  if (product == null) return true;
  return (
    isRecord(product) &&
    (typeof product["id"] === "string" || typeof product["id"] === "number") &&
    typeof product["title"] === "string" &&
    (product["slug"] === undefined || typeof product["slug"] === "string") &&
    (product["coverHorizontal"] == null || typeof product["coverHorizontal"] === "string") &&
    (product["coverVertical"] == null || typeof product["coverVertical"] === "string") &&
    (product["storeLink"] == null || typeof product["storeLink"] === "string")
  );
}

/**
 * Raw upstream access: returns the detail payload of every giveaway section on the GOG home
 * page — usually none, since GOG runs giveaways only occasionally. `locale` drives the response
 * language; `country` is accepted for contract parity but unused — upstream takes no region
 * parameter.
 */
export async function fetchGiveawaySections(options: {
  locale: string;
  country: string;
}): Promise<GogGiveawaySection[]> {
  const pageUrl = new URL(GOG_PAGE_URL);
  pageUrl.searchParams.set("locale", options.locale);
  log.debug({ locale: options.locale, country: options.country }, "fetching free games");
  const body = await fetchJson(pageUrl);

  const sections = isRecord(body) ? body["sections"] : undefined;
  if (!Array.isArray(sections) || !sections.every(isSection)) {
    throw new UpstreamError(STORE, "unexpected upstream response shape");
  }

  const giveawaySectionIds = sections
    .filter((section) => section.sectionType === GIVEAWAY_SECTION_TYPE)
    .flatMap((section) => (section.sectionId ? [section.sectionId] : []));

  log.debug({ count: giveawaySectionIds.length }, "received giveaway sections");
  const details = await Promise.all(
    giveawaySectionIds.map((sectionId) => {
      const sectionUrl = new URL(`${GOG_PAGE_URL}/sections/${sectionId}`);
      sectionUrl.searchParams.set("locale", options.locale);
      return fetchJson(sectionUrl);
    }),
  );
  if (!details.every(isGiveawaySection)) {
    throw new UpstreamError(STORE, "unexpected upstream response shape");
  }
  return details;
}
