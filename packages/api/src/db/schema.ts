import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Drizzle table for persisted giveaways — the feature owns its own storage schema, paralleling the
// TypeBox API schema in `model.ts`. One row per (store, id, locale, country); omitted rows become inactive
// rather than being deleted, so first/last-seen timestamps retain lightweight history.

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
    isActive: boolean("is_active").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", seenAt).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", seenAt).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.store, table.id, table.locale, table.country] }),
    index("giveaways_locale_country_active_free_until_idx").on(
      table.locale,
      table.country,
      table.isActive,
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

// Records refresh state for a (store, locale, country). A nullable fetched_at distinguishes a cold failed
// scope from a successful empty snapshot, while the lease columns coordinate refreshes across replicas.
export const giveawayFetches = pgTable(
  "giveaway_fetches",
  {
    store: text("store").notNull(),
    locale: text("locale").notNull(),
    country: text("country").notNull(),
    fetchedAt: timestamp("fetched_at", seenAt),
    failedAt: timestamp("failed_at", seenAt),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", seenAt),
  },
  (table) => [
    primaryKey({ columns: [table.store, table.locale, table.country] }),
    check(
      "giveaway_fetches_lease_all_or_none",
      sql`(
        ("lease_token" is null and "lease_expires_at" is null)
        or ("lease_token" is not null and "lease_expires_at" is not null)
      )`,
    ),
  ],
);
