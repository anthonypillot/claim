import { createLogger } from "../../../../utils/logger.ts";
import { UpstreamError } from "../shared.ts";
import type { GogGiveawaySection, GogSectionsResponse } from "./types.ts";

const log = createLogger("gog store");

// GOG giveaways only surface as a banner on the store home page; `2f` is that page's id in the
// unauthenticated sections API backing it. No GIVEAWAY_SECTION means no giveaway is running.
const GOG_PAGE_URL = "https://sections.gog.com/v1/pages/2f";
const GIVEAWAY_SECTION_TYPE = "GIVEAWAY_SECTION";
const STORE = "gog";

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
  const body = await fetchJson<GogSectionsResponse>(pageUrl);

  if (!Array.isArray(body.sections)) {
    throw new UpstreamError(STORE, "unexpected upstream response shape");
  }

  const giveawaySectionIds = body.sections
    .filter((section) => section.sectionType === GIVEAWAY_SECTION_TYPE)
    .flatMap((section) => (section.sectionId ? [section.sectionId] : []));

  log.debug({ count: giveawaySectionIds.length }, "received giveaway sections");
  return Promise.all(
    giveawaySectionIds.map((sectionId) => {
      const sectionUrl = new URL(`${GOG_PAGE_URL}/sections/${sectionId}`);
      sectionUrl.searchParams.set("locale", options.locale);
      return fetchJson<GogGiveawaySection>(sectionUrl);
    }),
  );
}
