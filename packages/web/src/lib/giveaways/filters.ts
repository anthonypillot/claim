import { STORE_IDS, type Giveaway, type StoreId } from "./model.ts";

export type StoreFilter = "all" | StoreId;
export type GiveawaySort = "default" | "ending-soon";

export type GiveawayFilters = {
  store: StoreFilter;
  sort: GiveawaySort;
};

export type StoreCounts = Record<StoreFilter, number>;

export function parseGiveawayFilters(searchParams: URLSearchParams): GiveawayFilters {
  const requestedStore = searchParams.get("store");
  const store = STORE_IDS.find((storeId) => storeId === requestedStore) ?? "all";

  return {
    store,
    sort: searchParams.get("sort") === "ending-soon" ? "ending-soon" : "default",
  };
}

export function createGiveawayFilterUrl(url: URL, filters: GiveawayFilters): URL {
  const nextUrl = new URL(url);

  if (filters.store === "all") nextUrl.searchParams.delete("store");
  else nextUrl.searchParams.set("store", filters.store);

  if (filters.sort === "default") nextUrl.searchParams.delete("sort");
  else nextUrl.searchParams.set("sort", filters.sort);

  return nextUrl;
}

export function getStoreCounts(giveaways: Giveaway[]): StoreCounts {
  const counts: StoreCounts = {
    all: giveaways.length,
    "epic-games": 0,
    "prime-gaming": 0,
    gog: 0,
    steam: 0,
  };

  for (const giveaway of giveaways) counts[giveaway.store] += 1;

  return counts;
}

export function filterAndSortGiveaways(giveaways: Giveaway[], filters: GiveawayFilters): Giveaway[] {
  const filtered =
    filters.store === "all" ? giveaways : giveaways.filter((giveaway) => giveaway.store === filters.store);

  if (filters.sort === "default") return filtered;

  return filtered.toSorted((left, right) => expiryTime(left.freeUntil) - expiryTime(right.freeUntil));
}

function expiryTime(value: string): number {
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
