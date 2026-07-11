import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { eq, sql } from "drizzle-orm";

import {
  giveawayFetches as giveawayFetchesTable,
  giveaways as giveawaysTable,
} from "../../db/schema.ts";
import { createTestDatabase } from "../../db/testing.ts";
import { createGiveaways } from "./index.ts";
import {
  type AllGiveawaysResponse,
  CACHE_TTL_HOURS,
  GiveawaysQuerySchema,
  STORE_IDS,
  type StoreGiveaway,
} from "./model.ts";
import { isFresh, markFetched, upsertGiveaways } from "./repository.ts";
import { epicFreeGamesFixture } from "./stores/epic-games/fixtures.ts";
import { gogGiveawaySectionFixtures, gogSectionsFixture } from "./stores/gog/fixtures.ts";
import { primeFreeGamesFixture, primeHomeHtmlFixture } from "./stores/prime-gaming/fixtures.ts";
import { steamFeaturedCategoriesFixture, steamGetItemsFixture } from "./stores/steam/fixtures.ts";

const ALL_URL = "http://localhost/giveaways";
const EPIC_URL = "http://localhost/giveaways/epic-games";
const PRIME_URL = "http://localhost/giveaways/prime-gaming";
const GOG_URL = "http://localhost/giveaways/gog";
const STEAM_URL = "http://localhost/giveaways/steam";

const MARKET_US = { locale: "en-US", country: "US" };

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let app: ReturnType<typeof createGiveaways>;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

// One stub for every upstream a route may hit: Epic's promotions endpoint, GOG's two-step
// section-list + giveaway-section flow, Steam's two-step featured + store-browse flow, and Prime
// Gaming's two-step session-bootstrap + GraphQL flow.
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
  if (url.includes("steampowered.com")) {
    const body = url.includes("IStoreBrowseService/GetItems")
      ? steamGetItemsFixture
      : steamFeaturedCategoriesFixture;
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

/** A minimal cached giveaway for seeding warm-cache assertions. */
function cachedSteamGiveaway(): StoreGiveaway {
  return {
    store: "steam",
    id: "100100",
    title: "Cached Steam Game",
    description: "",
    url: null,
    images: { wide: null, tall: null, thumbnail: null },
    seller: "Steam",
    price: null,
    freeUntil: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

beforeAll(async () => {
  db = await createTestDatabase();
  app = createGiveaways(() => db);
});

beforeEach(async () => {
  // Reset to a cold (empty, never-refreshed) cache so the read routes exercise the live-upstream fallback
  // by default. Both the rows and the refresh markers must be cleared.
  await db.delete(giveawaysTable);
  await db.delete(giveawayFetchesTable);
  // Cast: the stub doesn't carry fetch's static `preconnect` property.
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(stubUpstreamFetch as typeof fetch);
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("GiveawaysQuerySchema", () => {
  it("marks locale and country as optional (omittable, defaults applied at runtime)", () => {
    expect(GiveawaysQuerySchema.required).toBeUndefined();
  });
});

describe("GET /giveaways (cold cache → live fallback)", () => {
  it("merges every store's giveaways in store-declaration order", async () => {
    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      count: 4,
      giveaways: [
        { store: "epic-games", id: "offer-free-base-game", title: "Actually Free Game" },
        { store: "prime-gaming", id: "item-active-full-game", title: "Actually Free Full Game" },
        { store: "gog", id: "1207658787", title: "Actually Free GOG Game" },
        { store: "steam", id: "100100", title: "Actually Free Steam Game" },
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

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      count: 3,
      giveaways: [
        expect.objectContaining({ store: "prime-gaming", id: "item-active-full-game" }),
        expect.objectContaining({ store: "gog", id: "1207658787" }),
        expect.objectContaining({ store: "steam", id: "100100" }),
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

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      count: 3,
      giveaways: [
        expect.objectContaining({ store: "epic-games", id: "offer-free-base-game" }),
        expect.objectContaining({ store: "gog", id: "1207658787" }),
        expect.objectContaining({ store: "steam", id: "100100" }),
      ],
      errors: [{ store: "prime-gaming", error: "Failed to fetch giveaways from prime-gaming" }],
    });
  });

  it("returns 502 with a stable error body when every store fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from all stores",
    });
  });

  it("forwards locale and country to every store", async () => {
    await app.handle(new Request(`${ALL_URL}?locale=fr-FR&country=FR`));

    const epicCall = fetchSpy.mock.calls.find(([input]) => String(input).includes("epicgames.com"));
    expect(String(epicCall?.[0])).toContain("locale=fr-FR");
    expect(String(epicCall?.[0])).toContain("country=FR");

    const graphqlCall = fetchSpy.mock.calls.find(([input]) => String(input).includes("/graphql"));
    expect(new Headers(graphqlCall?.[1]?.headers).get("prime-gaming-language")).toBe("fr-FR");

    const gogCall = fetchSpy.mock.calls.find(([input]) =>
      String(input).includes("sections.gog.com"),
    );
    expect(String(gogCall?.[0])).toContain("locale=fr-FR");

    const steamCall = fetchSpy.mock.calls.find(([input]) =>
      String(input).includes("featuredcategories"),
    );
    expect(String(steamCall?.[0])).toContain("cc=FR");
    expect(String(steamCall?.[0])).toContain("l=french");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await app.handle(new Request(`${ALL_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("rejects an invalid country with 422", async () => {
    const response = await app.handle(new Request(`${ALL_URL}?country=FRA`));

    expect(response.status).toBe(422);
  });
});

describe("GET /giveaways (read-through cache)", () => {
  it("caches the aggregate on the first read and serves the second from the DB", async () => {
    const first = await app.handle(new Request(ALL_URL));
    expect(first.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled(); // miss → live fetch + write

    const callsAfterFirst = fetchSpy.mock.calls.length;
    const second = await app.handle(new Request(ALL_URL));

    expect(second.status).toBe(200);
    expect(((await second.json()) as AllGiveawaysResponse).count).toBe(4);
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst); // served from cache, no re-fetch
  });

  it("serves active cached rows once every store is fresh, without hitting upstreams", async () => {
    await upsertGiveaways(db, MARKET_US, [cachedSteamGiveaway()]);
    await markFetched(db, MARKET_US, [...STORE_IDS]);
    fetchSpy.mockClear();

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      count: 1,
      giveaways: [
        expect.objectContaining({ store: "steam", id: "100100", title: "Cached Steam Game" }),
      ],
      errors: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serves empty (no re-fetch) when the market is fresh but nothing is active", async () => {
    await markFetched(db, MARKET_US, [...STORE_IDS]);
    await upsertGiveaways(db, MARKET_US, [
      {
        ...cachedSteamGiveaway(),
        id: "expired",
        freeUntil: new Date(Date.now() - 1000).toISOString(),
      },
    ]);
    fetchSpy.mockClear();

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 0, giveaways: [], errors: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-fetches when a store's cache has passed the TTL", async () => {
    await upsertGiveaways(db, MARKET_US, [cachedSteamGiveaway()]);
    await markFetched(db, MARKET_US, [...STORE_IDS]);
    // Age one store's marker past the TTL → the market is no longer all-fresh → miss.
    await db
      .update(giveawayFetchesTable)
      .set({ fetchedAt: sql`now() - ${CACHE_TTL_HOURS + 1} * interval '1 hour'` })
      .where(eq(giveawayFetchesTable.store, "gog"));
    fetchSpy.mockClear();

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("caches only the stores that succeeded on a partial-failure read", async () => {
    fetchSpy.mockImplementation(((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("epicgames.com")) return Promise.reject(new Error("network down"));
      return stubUpstreamFetch(input);
    }) as typeof fetch);

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(((await response.json()) as AllGiveawaysResponse).errors).toEqual([
      { store: "epic-games", error: "Failed to fetch giveaways from epic-games" },
    ]);
    // The failed store was not cached (stays not-fresh, retried next time); the others are.
    expect(await isFresh(db, { ...MARKET_US, store: "epic-games" })).toBe(false);
    expect(await isFresh(db, { ...MARKET_US, store: "gog" })).toBe(true);
  });

  it("caches a per-store read and serves the second from the DB", async () => {
    const first = await app.handle(new Request(GOG_URL));
    expect(first.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();

    const callsAfterFirst = fetchSpy.mock.calls.length;
    const second = await app.handle(new Request(GOG_URL));

    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ store: "gog", count: 1 });
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("serves empty from cache for a fetched-but-empty store, without hitting the upstream", async () => {
    // A store fetched with zero giveaways (e.g. Steam with no promo) is served empty from cache, not re-fetched.
    await markFetched(db, MARKET_US, ["steam"]);
    fetchSpy.mockClear();

    const response = await app.handle(new Request(STEAM_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ store: "steam", count: 0, giveaways: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("GET /giveaways/epic-games", () => {
  it("returns the envelope with only currently-free base games", async () => {
    const response = await app.handle(new Request(EPIC_URL));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      store: "epic-games",
      count: 1,
      giveaways: [{ id: "offer-free-base-game", title: "Actually Free Game" }],
    });
  });

  it("forwards default locale and country upstream", async () => {
    await app.handle(new Request(EPIC_URL));

    const upstreamUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(upstreamUrl).toContain("locale=en-US");
    expect(upstreamUrl).toContain("country=US");
    expect(upstreamUrl).toContain("allowCountries=US");
  });

  it("forwards a user-specified locale upstream", async () => {
    await app.handle(new Request(`${EPIC_URL}?locale=fr-FR`));

    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("locale=fr-FR");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await app.handle(new Request(`${EPIC_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("rejects an invalid country with 422", async () => {
    const response = await app.handle(new Request(`${EPIC_URL}?country=FRA`));

    expect(response.status).toBe(422);
  });

  it("returns 502 with a stable error body when upstream fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await app.handle(new Request(EPIC_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from epic-games",
    });
  });
});

describe("GET /giveaways/prime-gaming", () => {
  it("returns the envelope with only currently-free full games", async () => {
    const response = await app.handle(new Request(PRIME_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      store: "prime-gaming",
      count: 1,
      giveaways: [{ id: "item-active-full-game", title: "Actually Free Full Game" }],
    });
  });

  it("forwards a user-specified locale upstream", async () => {
    await app.handle(new Request(`${PRIME_URL}?locale=fr-FR`));

    const graphqlInit = fetchSpy.mock.calls[1]?.[1];
    expect(new Headers(graphqlInit?.headers).get("prime-gaming-language")).toBe("fr-FR");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await app.handle(new Request(`${PRIME_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("returns 502 with a stable error body when upstream fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await app.handle(new Request(PRIME_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from prime-gaming",
    });
  });
});

describe("GET /giveaways/gog", () => {
  it("returns the envelope with only the currently-live giveaway", async () => {
    const response = await app.handle(new Request(GOG_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      store: "gog",
      count: 1,
      giveaways: [{ id: "1207658787", title: "Actually Free GOG Game" }],
    });
  });

  it("forwards a user-specified locale upstream", async () => {
    await app.handle(new Request(`${GOG_URL}?locale=fr-FR`));

    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("locale=fr-FR");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await app.handle(new Request(`${GOG_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("returns 502 with a stable error body when upstream fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await app.handle(new Request(GOG_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from gog",
    });
  });
});

describe("GET /giveaways/steam", () => {
  it("returns the envelope with only the currently-live free-to-keep giveaway", async () => {
    const response = await app.handle(new Request(STEAM_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      store: "steam",
      count: 1,
      giveaways: [{ id: "100100", title: "Actually Free Steam Game" }],
    });
  });

  it("forwards a user-specified locale and country upstream", async () => {
    await app.handle(new Request(`${STEAM_URL}?locale=fr-FR&country=FR`));

    const featuredUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(featuredUrl).toContain("cc=FR");
    expect(featuredUrl).toContain("l=french");
  });

  it("rejects an invalid locale with 422", async () => {
    const response = await app.handle(new Request(`${STEAM_URL}?locale=not!valid`));

    expect(response.status).toBe(422);
  });

  it("rejects an invalid country with 422", async () => {
    const response = await app.handle(new Request(`${STEAM_URL}?country=FRA`));

    expect(response.status).toBe(422);
  });

  it("serves from the cache once fresh", async () => {
    await upsertGiveaways(db, MARKET_US, [cachedSteamGiveaway()]);
    await markFetched(db, MARKET_US, ["steam"]);
    fetchSpy.mockClear();

    const response = await app.handle(new Request(STEAM_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      store: "steam",
      count: 1,
      giveaways: [{ id: "100100", title: "Cached Steam Game" }],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 with a stable error body when upstream fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    const response = await app.handle(new Request(STEAM_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch giveaways from steam",
    });
  });
});
