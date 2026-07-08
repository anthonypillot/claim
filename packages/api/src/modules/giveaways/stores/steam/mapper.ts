import type { Giveaway } from "../../model.ts";
import type { SteamCandidate, SteamFeaturedItem, SteamStoreItem } from "./types.ts";

/**
 * A candidate is a live free-to-keep giveaway iff its store-browse confirmation shows it is not
 * free-to-play, is still 100% off with a zero final price, and the discount has not ended yet.
 * Garbage dates fall out too since NaN comparisons are false. Returns the parts so `freeUntil`
 * falls out of the filter.
 */
function activeGiveaway(
  candidate: SteamCandidate,
  now: Date,
): { featured: SteamFeaturedItem; confirm: SteamStoreItem; freeUntil: string } | undefined {
  const { featured, confirm } = candidate;
  const option = confirm?.best_purchase_option;
  if (!confirm || confirm.is_free === true || !option) return undefined;
  if (option.discount_pct !== 100 || Number(option.final_price_in_cents) !== 0) return undefined;

  const endDate = option.active_discounts?.[0]?.discount_end_date;
  if (endDate == null) return undefined;
  const freeUntil = new Date(endDate * 1000);
  if (!(now < freeUntil)) return undefined;

  return { featured, confirm, freeUntil: freeUntil.toISOString() };
}

function toGiveaway(
  featured: SteamFeaturedItem,
  confirm: SteamStoreItem,
  freeUntil: string,
): Giveaway {
  const option = confirm.best_purchase_option;
  // Price parts split across sources: cents/currency from the featured item, the human-readable
  // string from the confirm call. Null unless every part is present, per the shared schema.
  const price =
    featured.original_price != null && option?.formatted_original_price && featured.currency
      ? {
          original: featured.original_price,
          formatted: option.formatted_original_price,
          currency: featured.currency,
        }
      : null;

  return {
    id: String(featured.id),
    title: featured.name ?? "",
    // Neither the featured item nor the confirm call carries a description.
    description: "",
    url: confirm.store_url_path
      ? `https://store.steampowered.com/${confirm.store_url_path}`
      : `https://store.steampowered.com/app/${featured.id}`,
    images: {
      wide: featured.header_image ?? null,
      // Steam's specials feed exposes no portrait artwork.
      tall: null,
      thumbnail: featured.small_capsule_image ?? null,
    },
    seller: "Steam",
    price,
    freeUntil,
  };
}

/** Keeps only currently-live free-to-keep giveaways and normalizes them. */
export function toGiveaways(candidates: SteamCandidate[]): Giveaway[] {
  const now = new Date();
  return candidates.flatMap((candidate) => {
    const active = activeGiveaway(candidate, now);
    return active ? [toGiveaway(active.featured, active.confirm, active.freeUntil)] : [];
  });
}
