import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { and, eq, sql } from "drizzle-orm";

import { giveawayFetches, giveaways } from "../../db/schema.ts";
import { createTestDatabase } from "../../db/testing.ts";
import { CACHE_TTL_HOURS, type Giveaway, REFRESH_FAILURE_COOLDOWN_MINUTES } from "./model.ts";
import {
  acquireRefreshLease,
  findActiveGiveaways,
  findFreshStoreIds,
  hasSuccessfulSnapshot,
  isInFailureCooldown,
  isFresh,
  recordRefreshFailure,
  refreshStore,
  toStoreGiveaway,
} from "./repository.ts";

const MARKET = { locale: "en-US", country: "US" };

let context: Awaited<ReturnType<typeof createTestDatabase>>;
let db: Awaited<ReturnType<typeof createTestDatabase>>["db"];

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

function giveaway(overrides: Partial<Giveaway> = {}): Giveaway {
  return {
    id: "100100",
    title: "A Free Game",
    description: "desc",
    url: "https://store.example/app/100100",
    images: { wide: "https://img/wide.jpg", tall: null, thumbnail: "https://img/thumb.jpg" },
    seller: "Steam",
    price: { original: 1999, formatted: "$19.99", currency: "USD" },
    freeUntil: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  };
}

describe("refreshStore", () => {
  it("stores a fetched-but-empty snapshot as fresh", async () => {
    expect(await refreshStore(db, MARKET, "steam", [])).toBe(0);
    expect(await findActiveGiveaways(db, { ...MARKET, store: "steam" })).toHaveLength(0);
    expect(await isFresh(db, { ...MARKET, store: "steam" })).toBe(true);
  });

  it("deduplicates a snapshot by id, keeping the last occurrence", async () => {
    const written = await refreshStore(db, MARKET, "steam", [
      giveaway({ id: "dup", title: "First" }),
      giveaway({ id: "dup", title: "Last" }),
    ]);

    expect(written).toBe(1);
    const [row] = await findActiveGiveaways(db, MARKET);
    expect(row?.title).toBe("Last");
  });

  it("round-trips full and nullable giveaway fields", async () => {
    const input = giveaway({
      price: null,
      url: null,
      images: { wide: null, tall: null, thumbnail: null },
    });
    await refreshStore(db, MARKET, "steam", [input]);

    const [row] = await findActiveGiveaways(db, MARKET);
    if (!row) throw new Error("expected a seeded row");
    expect(toStoreGiveaway(row)).toEqual({ ...input, store: "steam" });
  });

  it("nulls unsafe URLs before persistence", async () => {
    await refreshStore(db, MARKET, "steam", [
      giveaway({
        url: "javascript:alert(1)",
        images: {
          wide: "data:image/png,unsafe",
          tall: "file:///tmp/tall.jpg",
          thumbnail: "https://user:password@example.com/thumb.jpg",
        },
      }),
    ]);

    const [row] = await findActiveGiveaways(db, MARKET);
    expect(row).toMatchObject({
      url: null,
      imageWide: null,
      imageTall: null,
      imageThumbnail: null,
    });
  });

  it("nulls unsafe URLs read from legacy rows", async () => {
    await refreshStore(db, MARKET, "steam", [giveaway()]);
    await db.update(giveaways).set({
      url: "javascript:alert(1)",
      imageWide: "data:image/png,unsafe",
      imageTall: "file:///tmp/tall.jpg",
      imageThumbnail: "ftp://example.com/thumb.jpg",
    });

    const [row] = await findActiveGiveaways(db, MARKET);
    if (!row) throw new Error("expected a seeded row");
    expect(toStoreGiveaway(row)).toMatchObject({
      url: null,
      images: { wide: null, tall: null, thumbnail: null },
    });
  });

  it("deactivates omitted rows without deleting their history", async () => {
    await refreshStore(db, MARKET, "steam", [giveaway({ id: "kept" }), giveaway({ id: "gone" })]);
    await refreshStore(db, MARKET, "steam", [giveaway({ id: "kept" })]);

    expect((await findActiveGiveaways(db, MARKET)).map((row) => row.id)).toEqual(["kept"]);
    const [historical] = await db
      .select()
      .from(giveaways)
      .where(and(eq(giveaways.store, "steam"), eq(giveaways.id, "gone")));
    expect(historical?.isActive).toBe(false);
  });

  it("reactivates a returning row while preserving first-seen history", async () => {
    await refreshStore(db, MARKET, "steam", [giveaway()]);
    const [first] = await findActiveGiveaways(db, MARKET);
    if (!first) throw new Error("expected a seeded row");

    await Bun.sleep(25);
    await refreshStore(db, MARKET, "steam", []);
    await refreshStore(db, MARKET, "steam", [giveaway({ title: "Returned" })]);
    const [returned] = await findActiveGiveaways(db, MARKET);
    if (!returned) throw new Error("expected a reactivated row");

    expect(returned.title).toBe("Returned");
    expect(returned.isActive).toBe(true);
    expect(returned.firstSeenAt.getTime()).toBe(first.firstSeenAt.getTime());
    expect(returned.lastSeenAt.getTime()).toBeGreaterThan(first.lastSeenAt.getTime());
  });

  it("rolls back deactivation when the replacement snapshot is invalid", async () => {
    await refreshStore(db, MARKET, "steam", [giveaway()]);
    await db
      .update(giveawayFetches)
      .set({
        fetchedAt: sql`now() - ${CACHE_TTL_HOURS + 1} * interval '1 hour'`,
        freshUntil: sql`now() - interval '1 hour'`,
      })
      .where(eq(giveawayFetches.store, "steam"));
    const invalid = giveaway({
      price: { original: 1, formatted: null, currency: "USD" } as unknown as Giveaway["price"],
    });

    await expect(refreshStore(db, MARKET, "steam", [invalid])).rejects.toThrow();

    expect(await findActiveGiveaways(db, MARKET)).toHaveLength(1);
    expect(await isFresh(db, { ...MARKET, store: "steam" })).toBe(false);
  });

  it("serializes concurrent replacements of the same scope", async () => {
    await Promise.all([
      refreshStore(db, MARKET, "steam", [giveaway({ id: "first" })]),
      refreshStore(db, MARKET, "steam", [giveaway({ id: "second" })]),
    ]);

    const ids = (await findActiveGiveaways(db, MARKET)).map((row) => row.id);
    expect(ids).toHaveLength(1);
    const [id] = ids;
    if (!id) throw new Error("expected one active row");
    expect(["first", "second"]).toContain(id);
  });
});

describe("findActiveGiveaways", () => {
  it("returns only active rows still inside their free window", async () => {
    await refreshStore(db, MARKET, "steam", [
      giveaway({ id: "live" }),
      giveaway({ id: "expired", freeUntil: new Date(Date.now() - 1000).toISOString() }),
    ]);

    expect((await findActiveGiveaways(db, MARKET)).map((row) => row.id)).toEqual(["live"]);
  });

  it("does not deactivate another store or market", async () => {
    await refreshStore(db, MARKET, "steam", [giveaway({ id: "steam" })]);
    await refreshStore(db, MARKET, "gog", [giveaway({ id: "gog" })]);
    await refreshStore(db, { locale: "fr-FR", country: "FR" }, "steam", [giveaway({ id: "fr" })]);
    await refreshStore(db, MARKET, "steam", []);

    expect(await findActiveGiveaways(db, { ...MARKET, store: "steam" })).toHaveLength(0);
    expect(await findActiveGiveaways(db, { ...MARKET, store: "gog" })).toHaveLength(1);
    expect(await findActiveGiveaways(db, { locale: "fr-FR", country: "FR" })).toHaveLength(1);
  });
});

describe("freshness", () => {
  it("returns only known stores with current markers", async () => {
    await refreshStore(db, MARKET, "steam", []);
    await db.insert(giveawayFetches).values({ store: "retired", ...MARKET });
    await db.insert(giveawayFetches).values({
      store: "gog",
      ...MARKET,
      fetchedAt: sql`now() - ${CACHE_TTL_HOURS + 1} * interval '1 hour'`,
      freshUntil: sql`now() - interval '1 hour'`,
    });

    expect(await findFreshStoreIds(db, MARKET)).toEqual(["steam"]);
    expect(await isFresh(db, { ...MARKET, store: "gog" })).toBe(false);
  });
});

describe("refresh coordination", () => {
  it("grants only one concurrent lease for a scope", async () => {
    const tokens = await Promise.all([
      acquireRefreshLease(db, { ...MARKET, store: "steam" }),
      acquireRefreshLease(db, { ...MARKET, store: "steam" }),
    ]);

    expect(tokens.filter((token) => token !== null)).toHaveLength(1);
  });

  it("isolates leases by store and market", async () => {
    const tokens = await Promise.all([
      acquireRefreshLease(db, { ...MARKET, store: "steam" }),
      acquireRefreshLease(db, { ...MARKET, store: "gog" }),
      acquireRefreshLease(db, { locale: "fr-FR", country: "FR", store: "steam" }),
    ]);

    expect(tokens.every((token) => token !== null)).toBe(true);
  });

  it("preserves a stale snapshot and applies cooldown after failure", async () => {
    await refreshStore(db, MARKET, "steam", [giveaway()]);
    await db
      .update(giveawayFetches)
      .set({
        fetchedAt: sql`now() - ${CACHE_TTL_HOURS + 1} * interval '1 hour'`,
        freshUntil: sql`now() - interval '1 hour'`,
      })
      .where(eq(giveawayFetches.store, "steam"));
    const token = await acquireRefreshLease(db, { ...MARKET, store: "steam" });
    if (token === null) throw new Error("expected refresh lease");

    expect(await recordRefreshFailure(db, { ...MARKET, store: "steam" }, token)).toBe(true);

    expect(await findActiveGiveaways(db, { ...MARKET, store: "steam" })).toHaveLength(1);
    expect(await hasSuccessfulSnapshot(db, { ...MARKET, store: "steam" })).toBe(true);
    expect(await isInFailureCooldown(db, { ...MARKET, store: "steam" })).toBe(true);
    expect(await acquireRefreshLease(db, { ...MARKET, store: "steam" })).toBeNull();
  });

  it("retries after the failure cooldown expires", async () => {
    const scope = { ...MARKET, store: "steam" } as const;
    const firstToken = await acquireRefreshLease(db, scope);
    if (firstToken === null) throw new Error("expected refresh lease");
    await recordRefreshFailure(db, scope, firstToken);
    await db
      .update(giveawayFetches)
      .set({
        failedAt: sql`now() - ${REFRESH_FAILURE_COOLDOWN_MINUTES + 1} * interval '1 minute'`,
      })
      .where(eq(giveawayFetches.store, "steam"));

    expect(await acquireRefreshLease(db, scope)).not.toBeNull();
  });

  it("allows an expired lease to be reclaimed and rejects the old token", async () => {
    const scope = { ...MARKET, store: "steam" } as const;
    const oldToken = await acquireRefreshLease(db, scope);
    if (oldToken === null) throw new Error("expected refresh lease");
    await db
      .update(giveawayFetches)
      .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(giveawayFetches.store, "steam"));

    const newToken = await acquireRefreshLease(db, scope);
    expect(newToken).not.toBeNull();
    expect(newToken).not.toBe(oldToken);
    expect(await refreshStore(db, MARKET, "steam", [giveaway()], oldToken)).toBeNull();
    expect(await hasSuccessfulSnapshot(db, scope)).toBe(false);
  });

  it("clears failure and lease state after a successful refresh", async () => {
    const scope = { ...MARKET, store: "steam" } as const;
    const token = await acquireRefreshLease(db, scope);
    if (token === null) throw new Error("expected refresh lease");

    expect(await refreshStore(db, MARKET, "steam", [], token)).toBe(0);

    const [marker] = await db.select().from(giveawayFetches);
    expect(marker).toMatchObject({ failedAt: null, leaseToken: null, leaseExpiresAt: null });
    expect(marker?.fetchedAt).toBeInstanceOf(Date);
  });
});
