import { beforeEach, describe, expect, it } from "bun:test";

import { createTestDatabase } from "../../database/testing.ts";
import type { StoreGiveaway } from "./model.ts";
import {
  findActiveGiveaways,
  findGiveawayHistory,
  isRefreshed,
  markStoresRefreshed,
  toStoreGiveaway,
  upsertGiveaways,
} from "./repository.ts";

const MARKET = { locale: "en-US", country: "US" };

let db: Awaited<ReturnType<typeof createTestDatabase>>;

beforeEach(async () => {
  db = await createTestDatabase();
});

function giveaway(overrides: Partial<StoreGiveaway> = {}): StoreGiveaway {
  return {
    store: "steam",
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

describe("upsertGiveaways", () => {
  it("reports zero and writes nothing for an empty batch", async () => {
    expect(await upsertGiveaways(db, MARKET, [])).toBe(0);
    expect(await findActiveGiveaways(db, MARKET)).toHaveLength(0);
  });

  it("inserts rows and reports how many were written", async () => {
    const written = await upsertGiveaways(db, MARKET, [
      giveaway(),
      giveaway({ store: "gog", id: "555" }),
    ]);

    expect(written).toBe(2);
    expect(await findActiveGiveaways(db, MARKET)).toHaveLength(2);
  });

  it("dedups a batch by (store, id), keeping the last occurrence", async () => {
    const written = await upsertGiveaways(db, MARKET, [
      giveaway({ id: "dup", title: "First" }),
      giveaway({ id: "dup", title: "Last" }),
    ]);

    // Postgres rejects an ON CONFLICT batch that targets the same row twice, so dedup must happen first.
    expect(written).toBe(1);
    const [row] = await findActiveGiveaways(db, MARKET);
    expect(row?.title).toBe("Last");
  });

  it("preserves first_seen_at and bumps last_seen_at on re-upsert", async () => {
    await upsertGiveaways(db, MARKET, [giveaway()]);
    const [before] = await findActiveGiveaways(db, MARKET);
    if (!before) throw new Error("expected a seeded row");

    await Bun.sleep(25);
    await upsertGiveaways(db, MARKET, [giveaway({ title: "Renamed" })]);
    const [after] = await findActiveGiveaways(db, MARKET);
    if (!after) throw new Error("expected the row after re-upsert");

    expect(after.title).toBe("Renamed");
    expect(after.firstSeenAt.getTime()).toBe(before.firstSeenAt.getTime());
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(before.lastSeenAt.getTime());
  });

  it("round-trips a full giveaway back to the API shape", async () => {
    const input = giveaway();
    await upsertGiveaways(db, MARKET, [input]);

    const [row] = await findActiveGiveaways(db, MARKET);
    if (!row) throw new Error("expected a seeded row");
    expect(toStoreGiveaway(row)).toEqual(input);
  });

  it("round-trips a null price and null images", async () => {
    const input = giveaway({
      price: null,
      url: null,
      images: { wide: null, tall: null, thumbnail: null },
    });
    await upsertGiveaways(db, MARKET, [input]);

    const [row] = await findActiveGiveaways(db, MARKET);
    if (!row) throw new Error("expected a seeded row");
    expect(toStoreGiveaway(row)).toEqual(input);
  });
});

describe("findActiveGiveaways", () => {
  it("returns only rows still within their free window", async () => {
    await upsertGiveaways(db, MARKET, [
      giveaway({ id: "live" }),
      giveaway({ id: "expired", freeUntil: new Date(Date.now() - 1000).toISOString() }),
    ]);

    expect((await findActiveGiveaways(db, MARKET)).map((row) => row.id)).toEqual(["live"]);
  });

  it("scopes by store and by market", async () => {
    await upsertGiveaways(db, MARKET, [
      giveaway({ store: "steam" }),
      giveaway({ store: "gog", id: "g1" }),
    ]);
    await upsertGiveaways(db, { locale: "fr-FR", country: "FR" }, [giveaway({ store: "steam" })]);

    expect(
      (await findActiveGiveaways(db, { ...MARKET, store: "gog" })).map((r) => r.store),
    ).toEqual(["gog"]);
    expect(await findActiveGiveaways(db, { ...MARKET, store: "steam" })).toHaveLength(1);
    expect(await findActiveGiveaways(db, { locale: "fr-FR", country: "FR" })).toHaveLength(1);
  });
});

describe("markStoresRefreshed / isRefreshed", () => {
  it("reports a market as refreshed only after it is marked", async () => {
    expect(await isRefreshed(db, MARKET)).toBe(false);

    await markStoresRefreshed(db, MARKET, ["steam"]);

    expect(await isRefreshed(db, MARKET)).toBe(true);
    expect(await isRefreshed(db, { ...MARKET, store: "steam" })).toBe(true);
  });

  it("marks a refreshed-but-empty store, keeping it distinct from a never-refreshed store", async () => {
    // No giveaway rows written — only the refresh marker. isRefreshed must still report the store refreshed.
    await markStoresRefreshed(db, MARKET, ["steam"]);

    expect(await findActiveGiveaways(db, { ...MARKET, store: "steam" })).toHaveLength(0);
    expect(await isRefreshed(db, { ...MARKET, store: "steam" })).toBe(true);
    expect(await isRefreshed(db, { ...MARKET, store: "gog" })).toBe(false);
  });

  it("scopes markers by store and market", async () => {
    await markStoresRefreshed(db, MARKET, ["steam", "gog"]);

    expect(await isRefreshed(db, { ...MARKET, store: "epic-games" })).toBe(false);
    expect(await isRefreshed(db, { locale: "fr-FR", country: "FR" })).toBe(false);
  });

  it("is idempotent across repeated marks", async () => {
    await markStoresRefreshed(db, MARKET, ["steam"]);
    await markStoresRefreshed(db, MARKET, ["steam"]);

    expect(await isRefreshed(db, { ...MARKET, store: "steam" })).toBe(true);
  });
});

describe("findGiveawayHistory", () => {
  it("returns every row (active and expired), newest-seen first, honoring the limit", async () => {
    await upsertGiveaways(db, MARKET, [
      giveaway({ id: "a" }),
      giveaway({ id: "b", freeUntil: new Date(Date.now() - 1000).toISOString() }),
    ]);

    expect(await findGiveawayHistory(db, MARKET)).toHaveLength(2);
    expect(await findGiveawayHistory(db, { ...MARKET, limit: 1 })).toHaveLength(1);
  });
});
