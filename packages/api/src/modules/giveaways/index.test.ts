import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createTestDatabase } from "../../db/testing.ts";
import { createGiveawayCacheScopeResolver, type StoreAdapters } from "./cache-scope.ts";
import { createGiveaways } from "./index.ts";
import {
  type AllGiveawaysResponse,
  type Giveaway,
  GiveawaySchema,
  GiveawaysQuerySchema,
  type Market,
  type StoreId,
} from "./model.ts";
import { createGiveawayReads, type GiveawayReads } from "./read.ts";
import { UpstreamError } from "./stores/shared.ts";

const ALL_URL = "http://localhost/giveaways";
const STORE_URLS = {
  "epic-games": `${ALL_URL}/epic-games`,
  "prime-gaming": `${ALL_URL}/prime-gaming`,
  gog: `${ALL_URL}/gog`,
  steam: `${ALL_URL}/steam`,
} satisfies Record<StoreId, string>;

let integrationContext: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
  integrationContext = await createTestDatabase();
});

afterAll(async () => {
  await integrationContext.close();
});

function giveaway(id = "game"): Giveaway {
  return {
    id,
    title: "A Free Game",
    description: "desc",
    url: "https://store.example/game",
    images: { wide: "https://img.example/wide.jpg", tall: null, thumbnail: null },
    seller: "Store",
    price: null,
    freeUntil: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function createReads(onMarket?: (market: Market, store?: StoreId) => void): GiveawayReads {
  return {
    async getAll(market) {
      onMarket?.(market);
      return {
        count: 1,
        giveaways: [{ ...giveaway(), store: "steam" }],
        errors: [],
      };
    },
    async getStore<Store extends StoreId>(store: Store, market: Market) {
      onMarket?.(market, store);
      return { store, count: 1, giveaways: [giveaway()] };
    },
  };
}

describe("Giveaway route schemas", () => {
  it("allows omitted market fields", () => {
    expect(GiveawaysQuerySchema.required).toBeUndefined();
  });

  it("constrains response URLs to HTTP(S) URIs", () => {
    const urlSchema = GiveawaySchema.properties.url.anyOf[0];
    const imageSchema = GiveawaySchema.properties.images.properties.wide.anyOf[0];

    expect(urlSchema).toMatchObject({ format: "uri", pattern: "^https?://" });
    expect(imageSchema).toMatchObject({ format: "uri", pattern: "^https?://" });
  });
});

describe("Giveaway routes", () => {
  it("resolves the default market for aggregate reads", async () => {
    const markets: Market[] = [];
    const app = createGiveaways(createReads((market) => markets.push(market)));

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      count: 1,
      giveaways: [expect.objectContaining({ store: "steam", id: "game" })],
      errors: [],
    });
    expect(markets).toEqual([{ locale: "en-US", country: "US" }]);
  });

  it("canonicalizes a requested market before calling the read module", async () => {
    const calls: Array<{ market: Market; store?: StoreId }> = [];
    const app = createGiveaways(
      createReads((market, store) => {
        calls.push({ market, store });
      }),
    );

    const response = await app.handle(new Request(`${STORE_URLS.steam}?locale=FR-fr&country=fr`));

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ market: { locale: "fr-FR", country: "FR" }, store: "steam" }]);
  });

  it("registers each per-Store route with its literal envelope", async () => {
    const app = createGiveaways(createReads());

    for (const [store, url] of Object.entries(STORE_URLS)) {
      const response = await app.handle(new Request(url));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        store,
        count: 1,
        giveaways: [expect.objectContaining({ id: "game" })],
      });
    }
  });

  it("rejects malformed and unsupported markets before calling reads", async () => {
    let calls = 0;
    const app = createGiveaways(
      createReads(() => {
        calls += 1;
      }),
    );

    const malformed = await app.handle(new Request(`${ALL_URL}?locale=not!valid`));
    const unsupported = await app.handle(new Request(`${ALL_URL}?locale=de-DE&country=DE`));

    expect(malformed.status).toBe(422);
    expect(await malformed.json()).toEqual({ error: "Invalid request" });
    expect(unsupported.status).toBe(422);
    expect(await unsupported.json()).toEqual({ error: "Unsupported locale" });
    expect(calls).toBe(0);
  });

  it("translates unavailable aggregate and per-Store reads to stable 502 responses", async () => {
    const reads = createReads();
    reads.getAll = async () => {
      throw new UpstreamError("all stores", "all store fetches failed");
    };
    reads.getStore = async (store) => {
      throw new UpstreamError(store, "store refresh failed");
    };
    const app = createGiveaways(reads);

    const aggregate = await app.handle(new Request(ALL_URL));
    const store = await app.handle(new Request(STORE_URLS.gog));

    expect(aggregate.status).toBe(502);
    expect(await aggregate.json()).toEqual({ error: "Failed to fetch giveaways from all stores" });
    expect(store.status).toBe(502);
    expect(await store.json()).toEqual({ error: "Failed to fetch giveaways from gog" });
  });

  it("returns a stable 500 response for internal failures", async () => {
    const reads = createReads();
    reads.getAll = async () => {
      throw new Error("database credentials leaked here");
    };
    const app = createGiveaways(reads);

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });

  it("returns a stable 500 response when a read violates its response schema", async () => {
    const reads = createReads();
    reads.getAll = async () =>
      ({
        count: 1,
        giveaways: [{ ...giveaway(), url: "javascript:alert(1)", store: "steam" }],
      }) as unknown as AllGiveawaysResponse;
    const app = createGiveaways(reads);

    const response = await app.handle(new Request(ALL_URL));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });

  it("wires the real cache-scope and read modules without performing construction I/O", async () => {
    let calls = 0;
    const adapters = {
      "epic-games": async () => {
        calls += 1;
        return [];
      },
      "prime-gaming": async () => {
        calls += 1;
        return [];
      },
      gog: async () => {
        calls += 1;
        return [];
      },
      steam: async () => {
        calls += 1;
        return [giveaway()];
      },
    } satisfies StoreAdapters;
    const reads = createGiveawayReads(
      createGiveawayCacheScopeResolver(() => integrationContext.db, adapters),
    );
    const app = createGiveaways(reads);

    const first = await app.handle(new Request(ALL_URL));
    const second = await app.handle(new Request(ALL_URL));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ count: 1, errors: [] });
    expect(calls).toBe(4);
  });
});
