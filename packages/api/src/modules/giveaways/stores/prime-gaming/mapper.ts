import type { Giveaway } from "../../model.ts";
import type { PrimeItem } from "./types.ts";

/**
 * An item is a currently-free full game iff it's flagged FGWP ("Free Games with Prime") and
 * categorized FULL_GAME — the FREE_GAMES collection should only contain those, but the flags are
 * cheap defense in depth — and one of its offer windows is active right now. Upcoming and expired
 * windows fall out here (NaN date comparisons are false, so garbage dates fall out too). Returns
 * the matched window so `freeUntil` falls out of the filter.
 */
function getActiveFullGameWindow(item: PrimeItem, now: Date): { endTime: string } | undefined {
  if (item.isFGWP !== true || item.category !== "FULL_GAME") return undefined;
  for (const offer of item.offers ?? []) {
    if (!offer.endTime) continue;
    const started = !offer.startTime || new Date(offer.startTime) <= now;
    if (started && now <= new Date(offer.endTime)) return { endTime: offer.endTime };
  }
  return undefined;
}

function toGiveaway(item: PrimeItem, freeUntil: string): Giveaway {
  const hero = item.assets?.heroMedia?.defaultMedia?.src1x ?? null;
  const card = item.assets?.cardMedia?.defaultMedia?.src1x ?? null;
  return {
    id: item.id,
    title: item.game?.assets?.title ?? item.assets?.title ?? "",
    description: item.assets?.shortformDescription ?? "",
    url: item.assets?.externalClaimLink ?? null,
    // Prefer the hero banner for the wide slot, falling back to the card image so the slot is
    // never empty; the card also fills the thumbnail slot (both are 16:9 — Prime exposes no
    // portrait art).
    images: {
      wide: hero ?? card,
      tall: null,
      thumbnail: card,
    },
    seller: item.game?.assets?.publisher ?? "Unknown",
    // Prime Gaming exposes no price data for its giveaways.
    price: null,
    freeUntil,
  };
}

/** Keeps only currently-free full games and normalizes them. */
export function toGiveaways(items: PrimeItem[]): Giveaway[] {
  const now = new Date();
  return items.flatMap((item) => {
    const window = getActiveFullGameWindow(item, now);
    return window ? [toGiveaway(item, window.endTime)] : [];
  });
}
