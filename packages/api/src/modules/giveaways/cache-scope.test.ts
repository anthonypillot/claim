import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

import { giveawayFetches, giveaways } from "../../db/schema.ts";
import { createTestDatabase } from "../../db/testing.ts";
import { createGiveawayCacheScopeResolver, type StoreAdapters } from "./cache-scope.ts";
import type { Giveaway, Market, StoreId } from "./model.ts";

const MARKET = { locale: "en-US", country: "US" } satisfies Market;

let context: Awaited<ReturnType<typeof createTestDatabase>>;
let db: Awaited<ReturnType<typeof createTestDatabase>>["db"];

function giveaway(overrides: Partial<Giveaway> = {}): Giveaway {
  return {
    id: "100100",
    title: "A Free Game",
    description: "desc",
    url: "https://store.example/app/100100",
    images: { wide: "https://img/wide.jpg", tall: null, thumbnail: null },
    seller: "Steam",
    price: { original: 1999, formatted: "$19.99", currency: "USD" },
    freeUntil: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  };
}

function createAdapters(fetchSteam: StoreAdapters["steam"]): StoreAdapters {
  return {
    "epic-games": async () => [],
    "prime-gaming": async () => [],
    gog: async () => [],
    steam: fetchSteam,
  };
}

function createResolver(adapters: StoreAdapters) {
  return createGiveawayCacheScopeResolver(() => db, adapters);
}

async function ageSteamScope(): Promise<void> {
  await db
    .update(giveawayFetches)
    .set({ freshUntil: sql`now() - interval '1 hour'` })
    .where(
      and(
        eq(giveawayFetches.store, "steam"),
        eq(giveawayFetches.locale, MARKET.locale),
        eq(giveawayFetches.country, MARKET.country),
      ),
    );
}

beforeAll(async () => {
  context = await createTestDatabase();
  db = context.db;
});

beforeEach(async () => {
  await db.delete(giveaways);
  await db.delete(giveawayFetches);
});

afterAll(async () => {
  await context.close();
});

describe("Giveaway Cache Scope", () => {
  it("resolves, persists, and reuses a successful snapshot", async () => {
    let calls = 0;
    const resolve = createResolver(
      createAdapters(async () => {
        calls += 1;
        return [
          giveaway({ id: "duplicate", title: "First" }),
          giveaway({
            id: "duplicate",
            title: "Last",
            url: "javascript:alert(1)",
            images: {
              wide: "data:image/png,unsafe",
              tall: "file:///tmp/tall.jpg",
              thumbnail: "https://user:password@example.com/thumb.jpg",
            },
          }),
        ];
      }),
    );

    const first = await resolve("steam", MARKET);
    await db.update(giveaways).set({
      url: "javascript:alert(1)",
      imageWide: "data:image/png,unsafe",
      imageTall: "file:///tmp/tall.jpg",
      imageThumbnail: "ftp://example.com/thumb.jpg",
    });
    const second = await resolve("steam", MARKET);

    expect(first).toEqual({
      availability: "available",
      giveaways: [
        expect.objectContaining({
          id: "duplicate",
          title: "Last",
          url: null,
          images: { wide: null, tall: null, thumbnail: null },
        }),
      ],
    });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });

  it("replaces a previous snapshot with a fresh successful empty snapshot", async () => {
    let calls = 0;
    let items = [giveaway({ id: "previous" })];
    const resolve = createResolver(
      createAdapters(async () => {
        calls += 1;
        return items;
      }),
    );

    await resolve("steam", MARKET);
    await ageSteamScope();
    items = [];
    expect(await resolve("steam", MARKET)).toEqual({
      availability: "available",
      giveaways: [],
    });
    expect(await resolve("steam", MARKET)).toEqual({
      availability: "available",
      giveaways: [],
    });
    const [previous] = await db.select().from(giveaways).where(eq(giveaways.id, "previous"));
    expect(previous?.isActive).toBe(false);
    expect(calls).toBe(2);
  });

  it("refreshes at the earliest Giveaway free-window end", async () => {
    let calls = 0;
    const resolve = createResolver(
      createAdapters(async () => {
        calls += 1;
        return calls === 1
          ? [giveaway({ id: "expired", freeUntil: new Date(Date.now() - 1000).toISOString() })]
          : [giveaway({ id: "replacement" })];
      }),
    );

    expect((await resolve("steam", MARKET)).giveaways).toEqual([]);
    expect((await resolve("steam", MARKET)).giveaways).toEqual([
      expect.objectContaining({ id: "replacement" }),
    ]);
    expect(calls).toBe(2);
  });

  it("deactivates omitted Giveaways and preserves returning history", async () => {
    let items = [giveaway({ id: "kept" }), giveaway({ id: "gone" })];
    const resolve = createResolver(createAdapters(async () => items));

    await resolve("steam", MARKET);
    const [firstGone] = await db.select().from(giveaways).where(eq(giveaways.id, "gone"));
    await ageSteamScope();
    items = [giveaway({ id: "kept" })];
    await resolve("steam", MARKET);

    const [inactiveGone] = await db.select().from(giveaways).where(eq(giveaways.id, "gone"));
    expect(inactiveGone?.isActive).toBe(false);

    await ageSteamScope();
    await Bun.sleep(10);
    items = [giveaway({ id: "gone", title: "Returned" })];
    await resolve("steam", MARKET);
    const [returned] = await db.select().from(giveaways).where(eq(giveaways.id, "gone"));
    expect(returned).toMatchObject({ title: "Returned", isActive: true });
    expect(returned?.firstSeenAt.getTime()).toBe(firstGone?.firstSeenAt.getTime());
    expect(returned?.lastSeenAt.getTime()).toBeGreaterThan(firstGone?.lastSeenAt.getTime() ?? 0);
  });

  it("serves a degraded snapshot and suppresses retries during cooldown", async () => {
    let shouldFail = false;
    let calls = 0;
    const resolve = createResolver(
      createAdapters(async () => {
        calls += 1;
        if (shouldFail) throw new Error("network down");
        return [giveaway()];
      }),
    );
    await resolve("steam", MARKET);
    await ageSteamScope();
    shouldFail = true;

    const firstFailure = await resolve("steam", MARKET);
    const cooldownRead = await resolve("steam", MARKET);

    expect(firstFailure).toEqual({
      availability: "degraded",
      giveaways: [expect.objectContaining({ id: "100100" })],
    });
    expect(cooldownRead).toEqual(firstFailure);
    expect(calls).toBe(2);
  });

  it("returns unavailable during a cold-failure cooldown and recovers afterward", async () => {
    let calls = 0;
    let shouldFail = true;
    const resolve = createResolver(
      createAdapters(async () => {
        calls += 1;
        if (shouldFail) throw new Error("network down");
        return [giveaway({ id: "recovered" })];
      }),
    );

    expect(await resolve("steam", MARKET)).toEqual({
      availability: "unavailable",
      giveaways: [],
    });
    expect(await resolve("steam", MARKET)).toEqual({
      availability: "unavailable",
      giveaways: [],
    });
    await db
      .update(giveawayFetches)
      .set({ failedAt: sql`now() - interval '6 minutes'` })
      .where(eq(giveawayFetches.store, "steam"));
    shouldFail = false;

    expect(await resolve("steam", MARKET)).toEqual({
      availability: "available",
      giveaways: [expect.objectContaining({ id: "recovered" })],
    });
    const [marker] = await db.select().from(giveawayFetches);
    expect(marker).toMatchObject({ failedAt: null, leaseToken: null, leaseExpiresAt: null });
    expect(calls).toBe(2);
  });

  it("returns a degraded empty result when no cached Giveaway remains active", async () => {
    let shouldFail = false;
    const resolve = createResolver(
      createAdapters(async () => {
        if (shouldFail) throw new Error("network down");
        return [giveaway()];
      }),
    );
    await resolve("steam", MARKET);
    await ageSteamScope();
    await db
      .update(giveaways)
      .set({ freeUntil: sql`now() - interval '1 second'` })
      .where(eq(giveaways.store, "steam"));
    shouldFail = true;

    expect(await resolve("steam", MARKET)).toEqual({
      availability: "degraded",
      giveaways: [],
    });
  });

  it("shares one refresh between concurrent resolutions of the same scope", async () => {
    let calls = 0;
    let releaseFetch: (() => void) | undefined;
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const adapters = createAdapters(async () => {
      calls += 1;
      signalStarted?.();
      await gate;
      return [giveaway()];
    });
    const firstResolver = createResolver(adapters);
    const secondResolver = createResolver(adapters);

    const first = firstResolver("steam", MARKET);
    await started;
    const second = secondResolver("steam", MARKET);
    releaseFetch?.();

    expect((await Promise.all([first, second])).map((result) => result.availability)).toEqual([
      "available",
      "available",
    ]);
    expect(calls).toBe(1);
  });

  it("does not poll or call a Store adapter while another worker owns the lease", async () => {
    let releaseFirst: (() => void) | undefined;
    let signalFirstStarted: (() => void) | undefined;
    let secondCalls = 0;
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStarted = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = createResolver(
      createAdapters(async () => {
        signalFirstStarted?.();
        await firstGate;
        return [];
      }),
    );
    const second = createResolver(
      createAdapters(async () => {
        secondCalls += 1;
        return [];
      }),
    );

    const owner = first("steam", MARKET);
    await firstStarted;
    const denied = await Promise.race([
      second("steam", MARKET),
      Bun.sleep(1000).then(() => {
        throw new Error("lease denial unexpectedly waited");
      }),
    ]);

    expect(denied).toEqual({ availability: "unavailable", giveaways: [] });
    expect(secondCalls).toBe(0);
    releaseFirst?.();
    await owner;
  });

  it("isolates Store and Market cache scopes", async () => {
    const seen: Array<{ adapter: StoreId; market: Market }> = [];
    const adapters = {
      "epic-games": async (market: Market) => {
        seen.push({ adapter: "epic-games", market });
        return [];
      },
      "prime-gaming": async () => [],
      gog: async () => [],
      steam: async (market: Market) => {
        seen.push({ adapter: "steam", market });
        return [];
      },
    } satisfies StoreAdapters;
    const resolve = createResolver(adapters);

    await Promise.all([
      resolve("steam", MARKET),
      resolve("epic-games", MARKET),
      resolve("steam", { locale: "fr-FR", country: "FR" }),
    ]);

    expect(
      seen.toSorted((a, b) =>
        `${a.adapter}:${a.market.locale}`.localeCompare(`${b.adapter}:${b.market.locale}`),
      ),
    ).toEqual([
      { adapter: "epic-games", market: MARKET },
      { adapter: "steam", market: MARKET },
      { adapter: "steam", market: { locale: "fr-FR", country: "FR" } },
    ]);
  });

  it("rolls back an invalid replacement and rejects persistence failures", async () => {
    let items = [giveaway({ id: "existing" })];
    const resolve = createResolver(createAdapters(async () => items));
    await resolve("steam", MARKET);
    await ageSteamScope();
    items = [
      giveaway({
        id: "invalid",
        price: { original: 1, formatted: null, currency: "USD" } as unknown as Giveaway["price"],
      }),
    ];

    await expect(resolve("steam", MARKET)).rejects.toThrow();
    const inspect = createResolver(
      createAdapters(async () => {
        throw new Error("lease owner should prevent another refresh");
      }),
    );
    expect(await inspect("steam", MARKET)).toEqual({
      availability: "degraded",
      giveaways: [expect.objectContaining({ id: "existing" })],
    });
  });

  it("fences an expired lease owner from replacing a newer snapshot", async () => {
    let releaseFirst: (() => void) | undefined;
    let signalFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStarted = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = createResolver(
      createAdapters(async () => {
        signalFirstStarted?.();
        await firstGate;
        return [giveaway({ id: "old-owner" })];
      }),
    );
    const second = createResolver(createAdapters(async () => [giveaway({ id: "new-owner" })]));

    const oldOwner = first("steam", MARKET);
    await firstStarted;
    await db
      .update(giveawayFetches)
      .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(giveawayFetches.store, "steam"));
    const newOwner = await second("steam", MARKET);
    releaseFirst?.();
    const fencedOwner = await oldOwner;

    expect(newOwner.giveaways).toEqual([expect.objectContaining({ id: "new-owner" })]);
    expect(fencedOwner).toEqual({
      availability: "degraded",
      giveaways: [expect.objectContaining({ id: "new-owner" })],
    });
  });

  it("rejects database-provider failures", async () => {
    const resolve = createGiveawayCacheScopeResolver(
      () => {
        throw new Error("database unavailable");
      },
      createAdapters(async () => []),
    );

    await expect(resolve("steam", MARKET)).rejects.toThrow("database unavailable");
  });
});
