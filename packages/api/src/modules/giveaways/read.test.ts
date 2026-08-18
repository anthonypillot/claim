import { describe, expect, it } from "bun:test";

import type { GiveawayCacheScopeResolution, ResolveGiveawayCacheScope } from "./cache-scope.ts";
import type { Giveaway, StoreId } from "./model.ts";
import { createGiveawayReads } from "./read.ts";
import { UpstreamError } from "./stores/shared.ts";

const MARKET = { locale: "en-US", country: "US" };

function giveaway(id: string): Giveaway {
  return {
    id,
    title: id,
    description: "",
    url: null,
    images: { wide: null, tall: null, thumbnail: null },
    seller: "Store",
    price: null,
    freeUntil: "2030-01-01T00:00:00.000Z",
  };
}

function createResolver(
  resolutions: Partial<Record<StoreId, GiveawayCacheScopeResolution>>,
): ResolveGiveawayCacheScope {
  return async function resolve(store): Promise<GiveawayCacheScopeResolution> {
    return resolutions[store] ?? { availability: "available", giveaways: [] };
  };
}

describe("Giveaway reads", () => {
  it("sorts usable Store scopes and reports degraded or unavailable Stores", async () => {
    const reads = createGiveawayReads(
      createResolver({
        "epic-games": { availability: "available", giveaways: [giveaway("b"), giveaway("a")] },
        "prime-gaming": { availability: "unavailable", giveaways: [] },
        gog: { availability: "degraded", giveaways: [giveaway("gog")] },
        steam: { availability: "available", giveaways: [giveaway("steam")] },
      }),
    );

    expect(await reads.getAll(MARKET)).toEqual({
      count: 4,
      giveaways: [
        expect.objectContaining({ store: "epic-games", id: "a" }),
        expect.objectContaining({ store: "epic-games", id: "b" }),
        expect.objectContaining({ store: "gog", id: "gog" }),
        expect.objectContaining({ store: "steam", id: "steam" }),
      ],
      errors: [
        { store: "prime-gaming", error: "Failed to fetch giveaways from prime-gaming" },
        { store: "gog", error: "Failed to fetch giveaways from gog" },
      ],
    });
  });

  it("rejects an aggregate when every Store is unavailable", async () => {
    const unavailable = { availability: "unavailable", giveaways: [] } as const;
    const reads = createGiveawayReads(
      createResolver({
        "epic-games": unavailable,
        "prime-gaming": unavailable,
        gog: unavailable,
        steam: unavailable,
      }),
    );

    await expect(reads.getAll(MARKET)).rejects.toEqual(
      new UpstreamError("all stores", "all store fetches failed", {
        cause: expect.any(AggregateError),
      }),
    );
  });

  it("sorts a degraded per-Store snapshot without rejecting it", async () => {
    const reads = createGiveawayReads(
      createResolver({
        steam: { availability: "degraded", giveaways: [giveaway("b"), giveaway("a")] },
      }),
    );

    expect(await reads.getStore("steam", MARKET)).toEqual({
      store: "steam",
      count: 2,
      giveaways: [giveaway("a"), giveaway("b")],
    });
  });

  it("rejects an unavailable per-Store scope", async () => {
    const reads = createGiveawayReads(
      createResolver({ steam: { availability: "unavailable", giveaways: [] } }),
    );

    await expect(reads.getStore("steam", MARKET)).rejects.toEqual(
      new UpstreamError("steam", "store refresh failed"),
    );
  });
});
