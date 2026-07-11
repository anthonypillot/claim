import { and, eq, gt, inArray, sql } from "drizzle-orm";

import type { Database } from "../../db/client.ts";
import type { GiveawayRow, NewGiveawayRow } from "../../db/schema.ts";
import { giveawayFetches, giveaways } from "../../db/schema.ts";
import { createLogger } from "../../utils/logger.ts";
import type { Giveaway, StoreGiveaway, StoreId } from "./model.ts";
import { CACHE_TTL_HOURS, STORE_IDS } from "./model.ts";

const log = createLogger("giveaways repository");

/** A cache slice: a market (locale + country), optionally narrowed to a single store. */
type Scope = { locale: string; country: string; store?: StoreId };

function toRow(
  store: StoreId,
  giveaway: Giveaway,
  locale: string,
  country: string,
  now: Date,
): NewGiveawayRow {
  return {
    store,
    id: giveaway.id,
    locale,
    country,
    title: giveaway.title,
    description: giveaway.description,
    url: giveaway.url,
    imageWide: giveaway.images.wide,
    imageTall: giveaway.images.tall,
    imageThumbnail: giveaway.images.thumbnail,
    seller: giveaway.seller,
    priceOriginal: giveaway.price?.original ?? null,
    priceFormatted: giveaway.price?.formatted ?? null,
    priceCurrency: giveaway.price?.currency ?? null,
    freeUntil: new Date(giveaway.freeUntil),
    isActive: true,
    // firstSeenAt is intentionally omitted so it defaults on insert and is preserved on update.
    lastSeenAt: now,
  };
}

/** Row → the bare giveaway shape used by per-store endpoints (no `store` tag). */
export function toGiveaway(row: GiveawayRow): Giveaway {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    images: { wide: row.imageWide, tall: row.imageTall, thumbnail: row.imageThumbnail },
    seller: row.seller,
    // The all-or-nothing CHECK guarantees these agree; the inline checks let TS narrow away the nulls.
    price:
      row.priceOriginal !== null && row.priceFormatted !== null && row.priceCurrency !== null
        ? {
            original: row.priceOriginal,
            formatted: row.priceFormatted,
            currency: row.priceCurrency,
          }
        : null,
    freeUntil: row.freeUntil.toISOString(),
  };
}

/** Row → the store-tagged shape used by the aggregate endpoint. */
export function toStoreGiveaway(row: GiveawayRow): StoreGiveaway {
  // `store` is persisted as free text; the API boundary only ever writes STORE_IDS values.
  return { ...toGiveaway(row), store: row.store as StoreId };
}

function scopeWhere(scope: Scope) {
  return and(
    eq(giveaways.locale, scope.locale),
    eq(giveaways.country, scope.country),
    scope.store ? eq(giveaways.store, scope.store) : inArray(giveaways.store, STORE_IDS),
  );
}

/**
 * Atomically replaces one store/market's active snapshot while retaining omitted rows as history.
 * An empty successful refresh deactivates the old snapshot and still advances the freshness marker.
 */
export async function refreshStore(
  db: Database,
  market: { locale: string; country: string },
  store: StoreId,
  items: Giveaway[],
): Promise<number> {
  const now = new Date();
  const deduped = new Map(items.map((item) => [item.id, item]));
  const rows = [...deduped.values()].map((item) =>
    toRow(store, item, market.locale, market.country, now),
  );

  await db.transaction(async (tx) => {
    await tx
      .insert(giveawayFetches)
      .values({ store, locale: market.locale, country: market.country })
      .onConflictDoNothing();
    await tx
      .select({ store: giveawayFetches.store })
      .from(giveawayFetches)
      .where(
        and(
          eq(giveawayFetches.store, store),
          eq(giveawayFetches.locale, market.locale),
          eq(giveawayFetches.country, market.country),
        ),
      )
      .for("update");

    await tx
      .update(giveaways)
      .set({ isActive: false })
      .where(scopeWhere({ ...market, store }));

    if (rows.length > 0) {
      await tx
        .insert(giveaways)
        .values(rows)
        .onConflictDoUpdate({
          target: [giveaways.store, giveaways.id, giveaways.locale, giveaways.country],
          set: {
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            url: sql`excluded.url`,
            imageWide: sql`excluded.image_wide`,
            imageTall: sql`excluded.image_tall`,
            imageThumbnail: sql`excluded.image_thumbnail`,
            seller: sql`excluded.seller`,
            priceOriginal: sql`excluded.price_original`,
            priceFormatted: sql`excluded.price_formatted`,
            priceCurrency: sql`excluded.price_currency`,
            freeUntil: sql`excluded.free_until`,
            isActive: true,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        });
    }

    await tx
      .update(giveawayFetches)
      .set({ fetchedAt: sql`now()` })
      .where(
        and(
          eq(giveawayFetches.store, store),
          eq(giveawayFetches.locale, market.locale),
          eq(giveawayFetches.country, market.country),
        ),
      );
  });

  log.debug({ store, ...market, rows: rows.length }, "refreshed store cache");
  return rows.length;
}

/** Giveaways currently within their free window for the given market. */
export async function findActiveGiveaways(db: Database, scope: Scope): Promise<GiveawayRow[]> {
  return db
    .select()
    .from(giveaways)
    .where(
      and(scopeWhere(scope), eq(giveaways.isActive, true), gt(giveaways.freeUntil, sql`now()`)),
    );
}

/** Known stores whose market scope was refreshed within the TTL. */
export async function findFreshStoreIds(
  db: Database,
  market: { locale: string; country: string },
): Promise<StoreId[]> {
  const rows = await db
    .select({ store: giveawayFetches.store })
    .from(giveawayFetches)
    .where(
      and(
        eq(giveawayFetches.locale, market.locale),
        eq(giveawayFetches.country, market.country),
        inArray(giveawayFetches.store, STORE_IDS),
        gt(giveawayFetches.fetchedAt, sql`now() - ${CACHE_TTL_HOURS} * interval '1 hour'`),
      ),
    );
  return rows.map((row) => row.store as StoreId);
}

/**
 * Whether a single store's cache for a market is fresh (fetched within the TTL). Stays `true` for a store
 * that was fetched but produced zero giveaways — the empty-store case a row count cannot express.
 */
export async function isFresh(
  db: Database,
  scope: { locale: string; country: string; store: StoreId },
): Promise<boolean> {
  return (await findFreshStoreIds(db, scope)).includes(scope.store);
}
