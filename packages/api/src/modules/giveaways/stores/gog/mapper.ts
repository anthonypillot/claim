import type { Giveaway } from "../../model.ts";
import { normalizeExternalUrl } from "../shared.ts";
import type { GogGiveawayProduct, GogGiveawaySection } from "./types.ts";

/**
 * A section is a live giveaway iff it carries a product and an end date still in the future —
 * GOG may keep serving an expired section briefly, and garbage dates fall out too since NaN
 * comparisons are false. Returns the parts so `freeUntil` falls out of the filter.
 */
function activeGiveaway(
  section: GogGiveawaySection,
  now: Date,
): { product: GogGiveawayProduct; endDate: string } | undefined {
  const product = section.properties?.product;
  const endDate = section.properties?.endDate;
  if (!product || !endDate) return undefined;
  if (!(now < new Date(endDate))) return undefined;
  return { product, endDate };
}

function toGiveaway(product: GogGiveawayProduct, freeUntil: string, locale: string): Giveaway {
  // Giveaway products usually omit storeLink — fall back to the slug-based store URL, whose
  // path takes GOG's two-letter language segment, not the full BCP 47 tag.
  const language = locale.split("-")[0] ?? locale;
  const url =
    normalizeExternalUrl(product.storeLink) ??
    normalizeExternalUrl(
      product.slug ? `https://www.gog.com/${language}/game/${product.slug}` : null,
    );
  return {
    // Coerced: the section payload has been observed with both string and numeric ids.
    id: String(product.id ?? ""),
    title: product.title ?? "",
    // The giveaway section carries no description.
    description: "",
    url,
    images: {
      wide: normalizeExternalUrl(product.coverHorizontal),
      tall: normalizeExternalUrl(product.coverVertical),
      thumbnail: null,
    },
    // The section payload names no publisher and, being a giveaway, exposes no price.
    seller: "GOG",
    price: null,
    freeUntil,
  };
}

/** Keeps only currently-live giveaways and normalizes them. */
export function toGiveaways(sections: GogGiveawaySection[], locale: string): Giveaway[] {
  const now = new Date();
  return sections.flatMap((section) => {
    const active = activeGiveaway(section, now);
    return active ? [toGiveaway(active.product, active.endDate, locale)] : [];
  });
}
