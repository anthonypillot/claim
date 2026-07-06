import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { giveaways } from "./index.ts";
import { epicFreeGamesFixture } from "./stores/epic-games/fixtures.ts";
import { primeFreeGamesFixture, primeHomeHtmlFixture } from "./stores/prime-gaming/fixtures.ts";

const EPIC_URL = "http://localhost/giveaways/epic-games";
const PRIME_URL = "http://localhost/giveaways/prime-gaming";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

// One stub for every upstream a route may hit: Epic's promotions endpoint, and Prime Gaming's
// two-step session-bootstrap + GraphQL flow.
beforeEach(() => {
  // Cast: the stub doesn't carry fetch's static `preconnect` property.
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: string | URL | Request,
  ) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("epicgames.com")) {
      return new Response(JSON.stringify(epicFreeGamesFixture), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/graphql")) {
      return new Response(JSON.stringify(primeFreeGamesFixture), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(primeHomeHtmlFixture, {
      headers: {
        "content-type": "text/html",
        "set-cookie": "session-id=test-session; Domain=.amazon.com; Path=/; Secure",
      },
    });
  }) as typeof fetch);
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("GET /giveaways/epic-games", () => {
  it("returns the envelope with only currently-free base games", async () => {
    const response = await giveaways.handle(new Request(EPIC_URL));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      store: "epic-games",
      count: 1,
      giveaways: [{ id: "offer-free-base-game", title: "Actually Free Game" }],
    });
  });

  it("forwards default locale and country upstream", async () => {
    await giveaways.handle(new Request(EPIC_URL));

    const upstreamUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(upstreamUrl).toContain("locale=en-US");
    expect(upstreamUrl).toContain("country=US");
    expect(upstreamUrl).toContain("allowCountries=US");
  });

  it("forwards a user-specified locale upstream", async () => {
    await giveaways.handle(new Request(`${EPIC_URL}?locale=fr-FR`));

    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("locale=fr-FR");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await giveaways.handle(new Request(`${EPIC_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("rejects an invalid country with 422", async () => {
    const response = await giveaways.handle(new Request(`${EPIC_URL}?country=FRA`));

    expect(response.status).toBe(422);
  });

  it("returns 502 with a stable error body when upstream fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await giveaways.handle(new Request(EPIC_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from epic-games",
    });
  });
});

describe("GET /giveaways/prime-gaming", () => {
  it("returns the envelope with only currently-free full games", async () => {
    const response = await giveaways.handle(new Request(PRIME_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      store: "prime-gaming",
      count: 1,
      giveaways: [{ id: "item-active-full-game", title: "Actually Free Full Game" }],
    });
  });

  it("forwards a user-specified locale upstream", async () => {
    await giveaways.handle(new Request(`${PRIME_URL}?locale=fr-FR`));

    const graphqlInit = fetchSpy.mock.calls[1]?.[1];
    expect(new Headers(graphqlInit?.headers).get("prime-gaming-language")).toBe("fr-FR");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await giveaways.handle(new Request(`${PRIME_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("returns 502 with a stable error body when upstream fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await giveaways.handle(new Request(PRIME_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from prime-gaming",
    });
  });
});
