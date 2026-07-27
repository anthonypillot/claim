import { describe, expect, it } from "vitest";
import type { Giveaway, StoreId } from "./model.ts";
import {
  createGiveawayFilterUrl,
  filterAndSortGiveaways,
  getStoreCounts,
  parseGiveawayFilters,
} from "./filters.ts";

function createGiveaway(id: string, store: StoreId, freeUntil: string): Giveaway {
  return {
    id,
    title: id,
    description: id,
    url: null,
    images: { wide: null, tall: null, thumbnail: null },
    seller: "Publisher",
    price: null,
    freeUntil,
    store,
  };
}

describe("parseGiveawayFilters", () => {
  it("parses supported filter values", () => {
    const params = new URLSearchParams("store=steam&sort=ending-soon");

    expect(parseGiveawayFilters(params)).toEqual({ store: "steam", sort: "ending-soon" });
  });

  it("falls back to defaults for unsupported values", () => {
    const params = new URLSearchParams("store=unknown&sort=latest");

    expect(parseGiveawayFilters(params)).toEqual({ store: "all", sort: "default" });
  });
});

describe("createGiveawayFilterUrl", () => {
  it("preserves unrelated parameters and writes active filters", () => {
    const url = new URL("https://claim.example/?country=FR#giveaways");

    expect(
      createGiveawayFilterUrl(url, { store: "gog", sort: "ending-soon" }).toString(),
    ).toBe("https://claim.example/?country=FR&store=gog&sort=ending-soon#giveaways");
  });

  it("removes default filters", () => {
    const url = new URL("https://claim.example/?store=steam&sort=ending-soon&country=FR");

    expect(createGiveawayFilterUrl(url, { store: "all", sort: "default" }).toString()).toBe(
      "https://claim.example/?country=FR",
    );
  });
});

describe("getStoreCounts", () => {
  it("counts all giveaways and each store", () => {
    const giveaways = [
      createGiveaway("epic-1", "epic-games", "2026-08-03T00:00:00.000Z"),
      createGiveaway("epic-2", "epic-games", "2026-08-02T00:00:00.000Z"),
      createGiveaway("steam-1", "steam", "2026-08-01T00:00:00.000Z"),
    ];

    expect(getStoreCounts(giveaways)).toEqual({
      all: 3,
      "epic-games": 2,
      "prime-gaming": 0,
      gog: 0,
      steam: 1,
    });
  });
});

describe("filterAndSortGiveaways", () => {
  it("filters by store and sorts nearest expiry first", () => {
    const giveaways = [
      createGiveaway("later", "steam", "2026-08-03T00:00:00.000Z"),
      createGiveaway("other-store", "gog", "2026-07-31T00:00:00.000Z"),
      createGiveaway("invalid", "steam", "not-a-date"),
      createGiveaway("sooner", "steam", "2026-08-01T00:00:00.000Z"),
    ];

    expect(
      filterAndSortGiveaways(giveaways, { store: "steam", sort: "ending-soon" }).map(
        (giveaway) => giveaway.id,
      ),
    ).toEqual(["sooner", "later", "invalid"]);
  });

  it("preserves API order by default", () => {
    const giveaways = [
      createGiveaway("later", "steam", "2026-08-03T00:00:00.000Z"),
      createGiveaway("sooner", "steam", "2026-08-01T00:00:00.000Z"),
    ];

    expect(
      filterAndSortGiveaways(giveaways, { store: "all", sort: "default" }).map(
        (giveaway) => giveaway.id,
      ),
    ).toEqual(["later", "sooner"]);
  });
});
