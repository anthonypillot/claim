import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UpstreamError } from "../shared.ts";
import { gogGiveawaySectionFixtures, gogSectionsFixture } from "./fixtures.ts";
import { fetchFreeGames } from "./index.ts";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function sectionResponse(sectionId: string): Response {
  return jsonResponse(gogGiveawaySectionFixtures[sectionId] ?? {});
}

/** The store fetches the section list, then each giveaway section — dispatch the stub on the URL. */
function stubFetch(overrides: { page?: () => Response; section?: (id: string) => Response } = {}) {
  // Cast: the stub doesn't carry fetch's static `preconnect` property.
  fetchSpy.mockImplementation((async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const sectionId = /\/sections\/([^/?]+)/.exec(url)?.[1];
    if (sectionId) return (overrides.section ?? sectionResponse)(sectionId);
    return (overrides.page ?? (() => jsonResponse(gogSectionsFixture)))();
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
  it("returns only the currently-live giveaway, fully mapped", async () => {
    const giveaways = await fetchFreeGames({ locale: "en-US", country: "US" });

    expect(giveaways).toEqual([
      {
        id: "1207658787",
        title: "Actually Free GOG Game",
        description: "",
        url: "https://www.gog.com/en/game/actually_free_gog_game",
        imageUrl: "https://images.gog-statics.com/cover-horizontal.png",
        seller: "GOG",
        price: null,
        freeUntil: "2099-12-31T00:00:00+00:00",
      },
    ]);
  });

  it("fetches the section list and every giveaway section with the locale", async () => {
    await fetchFreeGames({ locale: "fr-FR", country: "FR" });

    // One section-list call plus the four giveaway sections in the fixture.
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "https://sections.gog.com/v1/pages/2f?locale=fr-FR",
    );
    expect(String(fetchSpy.mock.calls[1]?.[0])).toBe(
      "https://sections.gog.com/v1/pages/2f/sections/section-giveaway-active?locale=fr-FR",
    );
  });

  it("returns no giveaways without fetching further when no giveaway section exists", async () => {
    stubFetch({
      page: () => jsonResponse({ sections: [{ sectionId: "s", sectionType: "NEWS_SECTION" }] }),
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

  it("throws UpstreamError on a non-2xx section-list response", async () => {
    stubFetch({ page: () => new Response("oops", { status: 503 }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "upstream returned 503",
    );
  });

  it("throws UpstreamError on a non-2xx giveaway-section response", async () => {
    stubFetch({ section: () => new Response("oops", { status: 500 }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "upstream returned 500",
    );
  });

  it("throws UpstreamError on a non-JSON body", async () => {
    stubFetch({ page: () => new Response("<html></html>") });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("throws UpstreamError when sections are missing", async () => {
    stubFetch({ page: () => jsonResponse({}) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });
});
