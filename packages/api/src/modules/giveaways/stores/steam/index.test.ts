import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UpstreamError } from "../shared.ts";
import { steamFeaturedCategoriesFixture, steamGetItemsFixture } from "./fixtures.ts";
import { fetchFreeGames } from "./index.ts";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function isGetItems(url: string): boolean {
  return url.includes("IStoreBrowseService/GetItems");
}

/** The store fetches featured specials, then the store-browse confirm — dispatch the stub on URL. */
function stubFetch(overrides: { featured?: () => Response; items?: () => Response } = {}) {
  // Cast: the stub doesn't carry fetch's static `preconnect` property.
  fetchSpy.mockImplementation((async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (isGetItems(url)) return (overrides.items ?? (() => jsonResponse(steamGetItemsFixture)))();
    return (overrides.featured ?? (() => jsonResponse(steamFeaturedCategoriesFixture)))();
  }) as typeof fetch);
}

beforeEach(() => {
  fetchSpy = spyOn(globalThis, "fetch");
  stubFetch();
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("fetchFreeGames", () => {
  it("returns only the currently-live free-to-keep giveaway, fully mapped", async () => {
    const giveaways = await fetchFreeGames({ locale: "en-US", country: "US" });

    expect(giveaways).toEqual([
      {
        id: "100100",
        title: "Actually Free Steam Game",
        description: "",
        url: "https://store.steampowered.com/app/100100/Actually_Free_Steam_Game",
        images: {
          wide: "https://shared.akamai.steamstatic.com/apps/100100/header.jpg",
          tall: null,
          thumbnail: "https://shared.akamai.steamstatic.com/apps/100100/capsule.jpg",
        },
        seller: "Steam",
        price: { original: 1999, formatted: "$19.99", currency: "USD" },
        freeUntil: new Date(4102444800 * 1000).toISOString(),
      },
    ]);
  });

  it("fetches featured specials then the store-browse confirm with locale and country", async () => {
    await fetchFreeGames({ locale: "fr-FR", country: "FR" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const featuredUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(featuredUrl).toContain("store.steampowered.com/api/featuredcategories");
    expect(featuredUrl).toContain("cc=FR");
    expect(featuredUrl).toContain("l=french");

    const itemsUrl = decodeURIComponent(String(fetchSpy.mock.calls[1]?.[0]));
    expect(isGetItems(itemsUrl)).toBe(true);
    expect(itemsUrl).toContain('"country_code":"FR"');
    expect(itemsUrl).toContain('"language":"french"');
  });

  it("returns no giveaways without confirming when no special is free-to-keep", async () => {
    stubFetch({
      featured: () =>
        jsonResponse({ specials: { items: [{ id: 1, discount_percent: 50, final_price: 999 }] } }),
    });

    const giveaways = await fetchFreeGames({ locale: "en-US", country: "US" });

    expect(giveaways).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws UpstreamError when the request fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("throws UpstreamError on a non-2xx featured response", async () => {
    stubFetch({ featured: () => new Response("oops", { status: 503 }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "upstream returned 503",
    );
  });

  it("throws UpstreamError on a non-2xx confirm response", async () => {
    stubFetch({ items: () => new Response("oops", { status: 500 }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "upstream returned 500",
    );
  });

  it("throws UpstreamError on a non-JSON body", async () => {
    stubFetch({ featured: () => new Response("<html></html>") });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("throws UpstreamError when specials are missing", async () => {
    stubFetch({ featured: () => jsonResponse({}) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });

  it("throws UpstreamError when a featured element is malformed", async () => {
    stubFetch({ featured: () => jsonResponse({ specials: { items: [null] } }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });

  it("throws UpstreamError when the confirm response has no store items", async () => {
    stubFetch({ items: () => jsonResponse({}) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });

  it("throws UpstreamError when a confirm element is malformed", async () => {
    stubFetch({ items: () => jsonResponse({ response: { store_items: [null] } }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });

  it("throws UpstreamError when a mapped purchase field is malformed", async () => {
    stubFetch({
      items: () =>
        jsonResponse({
          response: {
            store_items: [{ appid: 100100, best_purchase_option: { final_price_in_cents: null } }],
          },
        }),
    });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });
});
