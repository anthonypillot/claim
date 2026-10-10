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
    freshUntil: timestamp("fresh_until", seenAt),
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

export const discordSubscriptions = pgTable("discord_subscriptions", {
  guildId: text("guild_id").primaryKey(),
  channelId: text("channel_id").notNull(),
  locale: text("locale").notNull(),
  country: text("country").notNull(),
  // NULL means all current and future supported Stores; a non-empty array is a fixed selection.
  stores: text("stores").array(),
  revision: text("revision").notNull(),
  disabledAt: timestamp("disabled_at", seenAt),
  disabledReason: text("disabled_reason"),
  nextCheckAt: timestamp("next_check_at", seenAt).notNull().defaultNow(),
  checkToken: text("check_token"),
  checkExpiresAt: timestamp("check_expires_at", seenAt),
  deliveryAfter: timestamp("delivery_after", seenAt),
});

export const discordFollows = pgTable(
  "discord_follows",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => discordSubscriptions.guildId, { onDelete: "cascade" }),
    store: text("store").notNull(),
    baselineAt: timestamp("baseline_at", seenAt),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.store] })],
);

// Short-lived replay hashes contain no server/member identifiers or interaction tokens.
export const discordInteractions = pgTable("discord_interactions", {
  hash: text("hash").primaryKey(),
  expiresAt: timestamp("expires_at", seenAt).notNull(),
});

// Independent Store/Market history is deliberately not owned by a Discord server.
export const giveawayOccurrences = pgTable(
  "giveaway_occurrences",
  {
    store: text("store").notNull(),
    id: text("id").notNull(),
    locale: text("locale").notNull(),
    country: text("country").notNull(),
    occurrenceId: text("occurrence_id").notNull(),
    detectedAt: timestamp("detected_at", seenAt).notNull(),
    freeUntil: timestamp("free_until", seenAt).notNull(),
    active: boolean("active").notNull(),
    endedAt: timestamp("ended_at", seenAt),
  },
  (table) => [primaryKey({ columns: [table.store, table.id, table.locale, table.country] })],
);

export const discordDeliveries = pgTable(
  "discord_deliveries",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => discordSubscriptions.guildId, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    revision: text("revision").notNull(),
    store: text("store").notNull(),
    listingId: text("listing_id").notNull(),
    locale: text("locale").notNull(),
    country: text("country").notNull(),
    occurrenceId: text("occurrence_id").notNull(),
    detectedAt: timestamp("detected_at", seenAt).notNull(),
    updatedAt: timestamp("updated_at", seenAt).notNull(),
    state: text("state", {
      enum: [
        "pending",
        "attempting",
        "retry",
        "sent",
        "unknown",
        "cancelled",
        "expired",
        "rejected",
      ],
    }).notNull(),
    availableAt: timestamp("available_at", seenAt).notNull(),
    attemptToken: text("attempt_token"),
    attemptExpiresAt: timestamp("attempt_expires_at", seenAt),
    messageId: text("message_id"),
  },
  (table) => [
    index("discord_deliveries_due_idx").on(table.state, table.availableAt),
    index("discord_deliveries_guild_idx").on(table.guildId),
  ],
);

export const discordRuntime = pgTable("discord_runtime", {
  tokenFingerprint: text("token_fingerprint").primaryKey(),
  paused: boolean("paused").notNull().default(false),
  blockedUntil: timestamp("blocked_until", seenAt),
});

// Unassociated, token-salted bucket hashes coordinate REST limits without retaining server IDs.
export const discordRateLimits = pgTable(
  "discord_rate_limits",
  {
    bucketHash: text("bucket_hash").primaryKey(),
    blockedUntil: timestamp("blocked_until", seenAt).notNull(),
  },
  (table) => [index("discord_rate_limits_expiry_idx").on(table.blockedUntil)],
);
