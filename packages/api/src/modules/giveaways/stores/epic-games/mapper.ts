import type { Giveaway } from "../../model.ts";
import type { EpicOffer } from "./types.ts";

const IMAGE_PREFERENCE = ["OfferImageWide", "OfferImageTall", "Thumbnail"];

/**
 * An offer is a currently-free base game iff it is a BASE_GAME (no DLC, no bundles), its
 * discounted price is 0, and a promotional window is active right now. Upcoming-only promos
 * have no active window and fall out here. Returns the matched window so `freeUntil` falls
 * out of the filter.
 */
function activeFreeWindow(offer: EpicOffer, now: Date): { endDate: string } | undefined {
  if (offer.offerType !== "BASE_GAME") return undefined;
  if (offer.price?.totalPrice?.discountPrice !== 0) return undefined;
  return offer.promotions?.promotionalOffers
    ?.flatMap((group) => group.promotionalOffers ?? [])
    .find((window) => new Date(window.startDate) <= now && now <= new Date(window.endDate));
}

function toGiveaway(offer: EpicOffer, freeUntil: string, locale: string): Giveaway {
  // urlSlug is an opaque hash — never use it for store URLs.
  const pageSlug =
    offer.offerMappings?.[0]?.pageSlug ??
    offer.catalogNs?.mappings?.[0]?.pageSlug ??
    offer.productSlug ??
    null;
  const imageUrl =
    IMAGE_PREFERENCE.map((type) => offer.keyImages?.find((image) => image.type === type)?.url).find(
      (url): url is string => url !== undefined,
    ) ??
    offer.keyImages?.[0]?.url ??
    null;
  const totalPrice = offer.price?.totalPrice;
  return {
    id: offer.id,
    title: offer.title,
    description: offer.description,
    url: pageSlug ? `https://store.epicgames.com/${locale}/p/${pageSlug}` : null,
    imageUrl,
    seller: offer.seller?.name ?? "Unknown",
    price: {
      original: totalPrice?.originalPrice ?? 0,
      formatted: totalPrice?.fmtPrice?.originalPrice ?? "",
      currency: totalPrice?.currencyCode ?? "",
    },
    freeUntil,
  };
}

/** Keeps only currently-free base games and normalizes them. */
export function toGiveaways(offers: EpicOffer[], locale: string): Giveaway[] {
  const now = new Date();
  return offers.flatMap((offer) => {
    const window = activeFreeWindow(offer, now);
    return window ? [toGiveaway(offer, window.endDate, locale)] : [];
  });
}
