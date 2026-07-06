import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { giveaways } from "./index.ts";
import { epicFreeGamesFixture } from "./stores/epic-games/fixtures.ts";
import { gogGiveawaySectionFixtures, gogSectionsFixture } from "./stores/gog/fixtures.ts";
import { primeFreeGamesFixture, primeHomeHtmlFixture } from "./stores/prime-gaming/fixtures.ts";

const ALL_URL = "http://localhost/giveaways";
const EPIC_URL = "http://localhost/giveaways/epic-games";
const PRIME_URL = "http://localhost/giveaways/prime-gaming";
const GOG_URL = "http://localhost/giveaways/gog";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

// One stub for every upstream a route may hit: Epic's promotions endpoint, GOG's two-step
// section-list + giveaway-section flow, and Prime Gaming's two-step session-bootstrap +
// GraphQL flow.
async function stubUpstreamFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("epicgames.com")) {
    return new Response(JSON.stringify(epicFreeGamesFixture), {
      headers: { "content-type": "application/json" },
    });
  }
  if (url.includes("sections.gog.com")) {
    const sectionId = /\/sections\/([^/?]+)/.exec(url)?.[1];
    const body = sectionId ? (gogGiveawaySectionFixtures[sectionId] ?? {}) : gogSectionsFixture;
    return new Response(JSON.stringify(body), {
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
}

beforeEach(() => {
  // Cast: the stub doesn't carry fetch's static `preconnect` property.
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(stubUpstreamFetch as typeof fetch);
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("GET /giveaways", () => {
  it("merges every store's giveaways in store-declaration order", async () => {
    const response = await giveaways.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      count: 3,
      giveaways: [
        { store: "epic-games", id: "offer-free-base-game", title: "Actually Free Game" },
        { store: "prime-gaming", id: "item-active-full-game", title: "Actually Free Full Game" },
        { store: "gog", id: "1207658787", title: "Actually Free GOG Game" },
      ],
      errors: [],
    });
  });

  it("returns 200 with an errors entry when a single store fails", async () => {
    fetchSpy.mockImplementation(((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("epicgames.com")) return Promise.reject(new Error("network down"));
      return stubUpstreamFetch(input);
    }) as typeof fetch);

    const response = await giveaways.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      count: 2,
      giveaways: [
        expect.objectContaining({ store: "prime-gaming", id: "item-active-full-game" }),
        expect.objectContaining({ store: "gog", id: "1207658787" }),
      ],
      errors: [{ store: "epic-games", error: "Failed to fetch giveaways from epic-games" }],
    });
  });

  it("keeps the other stores' giveaways when prime-gaming fails", async () => {
    fetchSpy.mockImplementation(((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("luna.amazon.com")) return Promise.reject(new Error("network down"));
      return stubUpstreamFetch(input);
    }) as typeof fetch);

    const response = await giveaways.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      count: 2,
      giveaways: [
        expect.objectContaining({ store: "epic-games", id: "offer-free-base-game" }),
        expect.objectContaining({ store: "gog", id: "1207658787" }),
      ],
      errors: [{ store: "prime-gaming", error: "Failed to fetch giveaways from prime-gaming" }],
    });
  });

  it("returns 502 with a stable error body when every store fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await giveaways.handle(new Request(ALL_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from all stores",
    });
  });

  it("forwards locale and country to every store", async () => {
    await giveaways.handle(new Request(`${ALL_URL}?locale=fr-FR&country=FR`));

    const epicCall = fetchSpy.mock.calls.find(([input]) => String(input).includes("epicgames.com"));
    expect(String(epicCall?.[0])).toContain("locale=fr-FR");
    expect(String(epicCall?.[0])).toContain("country=FR");

    const graphqlCall = fetchSpy.mock.calls.find(([input]) => String(input).includes("/graphql"));
    expect(new Headers(graphqlCall?.[1]?.headers).get("prime-gaming-language")).toBe("fr-FR");

    const gogCall = fetchSpy.mock.calls.find(([input]) =>
      String(input).includes("sections.gog.com"),
    );
    expect(String(gogCall?.[0])).toContain("locale=fr-FR");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await giveaways.handle(new Request(`${ALL_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("rejects an invalid country with 422", async () => {
    const response = await giveaways.handle(new Request(`${ALL_URL}?country=FRA`));

    expect(response.status).toBe(422);
  });
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

describe("GET /giveaways/gog", () => {
  it("returns the envelope with only the currently-live giveaway", async () => {
    const response = await giveaways.handle(new Request(GOG_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      store: "gog",
      count: 1,
      giveaways: [{ id: "1207658787", title: "Actually Free GOG Game" }],
    });
  });

  it("forwards a user-specified locale upstream", async () => {
    await giveaways.handle(new Request(`${GOG_URL}?locale=fr-FR`));

    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("locale=fr-FR");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await giveaways.handle(new Request(`${GOG_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("returns 502 with a stable error body when upstream fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await giveaways.handle(new Request(GOG_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from gog",
    });
  });
});
