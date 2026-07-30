import type { Giveaway, GiveawayImages } from "../../model.ts";
import { normalizeExternalUrl } from "../shared.ts";
import type { EpicOffer } from "./types.ts";

function findImage(keyImages: EpicOffer["keyImages"], type: string): string | null {
  return normalizeExternalUrl(keyImages?.find((image) => image.type === type)?.url);
}

function toImages(keyImages: EpicOffer["keyImages"]): GiveawayImages {
  return {
    wide: findImage(keyImages, "OfferImageWide"),
    tall: findImage(keyImages, "OfferImageTall"),
    thumbnail: findImage(keyImages, "Thumbnail"),
  };
}

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
    .find((window) => new Date(window.startDate) <= now && now < new Date(window.endDate));
}

function toGiveaway(offer: EpicOffer, freeUntil: string, locale: string): Giveaway {
  // urlSlug is an opaque hash — never use it for store URLs.
  const pageSlug =
    offer.offerMappings?.[0]?.pageSlug ??
    offer.catalogNs?.mappings?.[0]?.pageSlug ??
    offer.productSlug ??
    null;
  const totalPrice = offer.price?.totalPrice;
  const price =
    totalPrice &&
    typeof totalPrice.originalPrice === "number" &&
    totalPrice.fmtPrice?.originalPrice &&
    totalPrice.currencyCode
      ? {
          original: totalPrice.originalPrice,
          formatted: totalPrice.fmtPrice.originalPrice,
          currency: totalPrice.currencyCode,
        }
      : null;
  return {
    id: offer.id,
    title: offer.title,
    description: offer.description,
    url: normalizeExternalUrl(
      pageSlug ? `https://store.epicgames.com/${locale}/p/${pageSlug}` : null,
    ),
    images: toImages(offer.keyImages),
    seller: offer.seller?.name ?? "Unknown",
    price,
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
