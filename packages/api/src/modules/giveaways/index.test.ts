import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { giveaways } from "./index.ts";
import { epicFreeGamesFixture } from "./stores/epic-games/fixtures.ts";

const BASE_URL = "http://localhost/giveaways/epic-games";

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

describe("GET /giveaways/epic-games", () => {
  it("returns the envelope with only currently-free base games", async () => {
    const response = await giveaways.handle(new Request(BASE_URL));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      store: "epic-games",
      count: 1,
      giveaways: [{ id: "offer-free-base-game", title: "Actually Free Game" }],
    });
  });

  it("forwards default locale and country upstream", async () => {
    await giveaways.handle(new Request(BASE_URL));

    const upstreamUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(upstreamUrl).toContain("locale=en-US");
    expect(upstreamUrl).toContain("country=FR");
    expect(upstreamUrl).toContain("allowCountries=FR");
  });

  it("forwards a user-specified locale upstream", async () => {
    await giveaways.handle(new Request(`${BASE_URL}?locale=fr-FR`));

    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("locale=fr-FR");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await giveaways.handle(new Request(`${BASE_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("rejects an invalid country with 422", async () => {
    const response = await giveaways.handle(new Request(`${BASE_URL}?country=FRA`));

    expect(response.status).toBe(422);
  });

  it("returns 502 with a stable error body when upstream fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await giveaways.handle(new Request(BASE_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from epic-games",
    });
  });
});
