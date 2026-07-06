import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UpstreamError } from "../shared.ts";
import { epicFreeGamesFixture } from "./fixtures.ts";
import { fetchFreeGames } from "./index.ts";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

beforeEach(() => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(epicFreeGamesFixture), {
      headers: { "content-type": "application/json" },
    }),
  );
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("fetchFreeGames", () => {
  it("returns only the currently-free base game, fully mapped", async () => {
    const giveaways = await fetchFreeGames({ locale: "en-US", country: "FR" });

    expect(giveaways).toEqual([
      {
        id: "offer-free-base-game",
        title: "Actually Free Game",
        description: "A free base game.",
        url: "https://store.epicgames.com/en-US/p/actually-free-game",
        imageUrl: "https://cdn.example.com/wide.png",
        seller: "WayForward",
        price: { original: 3599, formatted: "€35.99", currency: "EUR" },
        freeUntil: "2099-12-31T00:00:00.000Z",
      },
    ]);
  });

  it("forwards locale and uppercased country to the upstream URL", async () => {
    await fetchFreeGames({ locale: "fr-FR", country: "fr" });

    const upstreamUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(upstreamUrl).toStartWith(
      "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions",
    );
    expect(upstreamUrl).toContain("locale=fr-FR");
    expect(upstreamUrl).toContain("country=FR");
    expect(upstreamUrl).toContain("allowCountries=FR");
  });

  it("throws UpstreamError when the request fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    await expect(fetchFreeGames({ locale: "en-US", country: "FR" })).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("throws UpstreamError on a non-2xx upstream response", async () => {
    fetchSpy.mockResolvedValue(new Response("oops", { status: 503 }));

    await expect(fetchFreeGames({ locale: "en-US", country: "FR" })).rejects.toThrow(
      "upstream returned 503",
    );
  });

  it("throws UpstreamError on a non-JSON body", async () => {
    fetchSpy.mockResolvedValue(new Response("<html></html>"));

    await expect(fetchFreeGames({ locale: "en-US", country: "FR" })).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("throws UpstreamError when elements are missing", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: {} })));

    await expect(fetchFreeGames({ locale: "en-US", country: "FR" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });
});
