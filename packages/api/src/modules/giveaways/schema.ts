import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Drizzle table for persisted giveaways — the feature owns its own storage schema, paralleling the
// TypeBox API schema in `model.ts`. One row per (store, id, locale, country); rows are upserted on refresh
// and never deleted, so the table doubles as history (see `repository.ts`).

const seenAt = { withTimezone: true, mode: "date" } as const;

export const giveaways = pgTable(
  "giveaways",
  {
    store: text("store").notNull(),
    id: text("id").notNull(),
    locale: text("locale").notNull(),
    country: text("country").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    url: text("url"),
    imageWide: text("image_wide"),
    imageTall: text("image_tall"),
    imageThumbnail: text("image_thumbnail"),
    seller: text("seller").notNull(),
    priceOriginal: integer("price_original"),
    priceFormatted: text("price_formatted"),
    priceCurrency: text("price_currency"),
    freeUntil: timestamp("free_until", seenAt).notNull(),
    firstSeenAt: timestamp("first_seen_at", seenAt).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", seenAt).notNull().defaultNow(),
    fetchedAt: timestamp("fetched_at", seenAt).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.store, table.id, table.locale, table.country] }),
    index("giveaways_locale_country_free_until_idx").on(
      table.locale,
      table.country,
      table.freeUntil,
    ),
    // Price is an all-or-nothing group: either the store exposes a full price or none at all.
    check(
      "giveaways_price_all_or_none",
      sql`(
        ("price_original" is null and "price_formatted" is null and "price_currency" is null)
        or ("price_original" is not null and "price_formatted" is not null and "price_currency" is not null)
      )`,
    ),
  ],
);

export type GiveawayRow = typeof giveaways.$inferSelect;
export type NewGiveawayRow = typeof giveaways.$inferInsert;

// Records that a (store, locale, country) was successfully refreshed, independent of how many giveaways it
// produced. This is the authoritative "has this market been refreshed?" signal — a store that is legitimately
// empty right now still gets a marker, so reads serve an empty list from cache instead of falling back to a
// live fetch. Row count alone cannot express this (a refreshed-but-empty store has zero giveaway rows).
export const giveawayRefreshes = pgTable(
  "giveaway_refreshes",
  {
    store: text("store").notNull(),
    locale: text("locale").notNull(),
    country: text("country").notNull(),
    refreshedAt: timestamp("refreshed_at", seenAt).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.store, table.locale, table.country] })],
);
