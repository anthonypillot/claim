import { and, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import type { Database } from "../../db/client.ts";
import type { GiveawayRow, NewGiveawayRow } from "../../db/schema.ts";
import { giveawayFetches, giveaways } from "../../db/schema.ts";
import { createLogger } from "../../utils/logger.ts";
import type { Giveaway, Market, StoreId } from "./model.ts";
import type { FetchFreeGames } from "./stores/shared.ts";
import { normalizeExternalUrl } from "./stores/shared.ts";

const CACHE_TTL_HOURS = 24;
const REFRESH_FAILURE_COOLDOWN_MINUTES = 5;
const REFRESH_LEASE_SECONDS = 60;

const log = createLogger("giveaway cache scope");

type StoreScope = Market & { store: StoreId };
type RefreshStatus = "fresh" | "refreshed" | "degraded" | "unavailable";
type RefreshOutcome = { status: RefreshStatus };

export type StoreAdapters = Readonly<Record<StoreId, FetchFreeGames>>;

export type GiveawayCacheScopeResolution =
  | {
      readonly availability: "available" | "degraded";
      readonly giveaways: readonly Giveaway[];
    }
  | {
      readonly availability: "unavailable";
      readonly giveaways: readonly [];
    };

export type ResolveGiveawayCacheScope = (
  store: StoreId,
  market: Market,
) => Promise<GiveawayCacheScopeResolution>;

const refreshesByDatabase = new WeakMap<
  Database,
  WeakMap<StoreAdapters, Map<string, Promise<RefreshOutcome>>>
>();

function fetchScopeWhere(scope: StoreScope) {
  return and(
    eq(giveawayFetches.store, scope.store),
    eq(giveawayFetches.locale, scope.locale),
    eq(giveawayFetches.country, scope.country),
  );
}

function giveawayScopeWhere(scope: StoreScope) {
  return and(
    eq(giveaways.store, scope.store),
    eq(giveaways.locale, scope.locale),
    eq(giveaways.country, scope.country),
  );
}

function scopeKey(scope: StoreScope): string {
  return `${scope.store}\0${scope.locale}\0${scope.country}`;
}

function toRow(scope: StoreScope, giveaway: Giveaway, now: Date): NewGiveawayRow {
  return {
    store: scope.store,
    id: giveaway.id,
    locale: scope.locale,
    country: scope.country,
    title: giveaway.title,
    description: giveaway.description,
    url: normalizeExternalUrl(giveaway.url),
    imageWide: normalizeExternalUrl(giveaway.images.wide),
    imageTall: normalizeExternalUrl(giveaway.images.tall),
    imageThumbnail: normalizeExternalUrl(giveaway.images.thumbnail),
    seller: giveaway.seller,
    priceOriginal: giveaway.price?.original ?? null,
    priceFormatted: giveaway.price?.formatted ?? null,
    priceCurrency: giveaway.price?.currency ?? null,
    freeUntil: new Date(giveaway.freeUntil),
    isActive: true,
    // firstSeenAt defaults on insert and remains unchanged on conflict.
    lastSeenAt: now,
  };
}

function toGiveaway(row: GiveawayRow): Giveaway {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: normalizeExternalUrl(row.url),
    images: {
      wide: normalizeExternalUrl(row.imageWide),
      tall: normalizeExternalUrl(row.imageTall),
      thumbnail: normalizeExternalUrl(row.imageThumbnail),
    },
    seller: row.seller,
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

async function isFresh(db: Database, scope: StoreScope): Promise<boolean> {
  const rows = await db
    .select({ store: giveawayFetches.store })
    .from(giveawayFetches)
    .where(and(fetchScopeWhere(scope), gt(giveawayFetches.freshUntil, sql`now()`)))
    .limit(1);
  return rows.length === 1;
}

async function hasSuccessfulSnapshot(db: Database, scope: StoreScope): Promise<boolean> {
  const rows = await db
    .select({ store: giveawayFetches.store })
    .from(giveawayFetches)
    .where(and(fetchScopeWhere(scope), isNotNull(giveawayFetches.fetchedAt)))
    .limit(1);
  return rows.length === 1;
}

async function acquireRefreshLease(db: Database, scope: StoreScope): Promise<string | null> {
  const token = crypto.randomUUID();
  const rows = await db
    .insert(giveawayFetches)
    .values({
      ...scope,
      leaseToken: token,
      leaseExpiresAt: sql`now() + ${REFRESH_LEASE_SECONDS} * interval '1 second'`,
    })
    .onConflictDoUpdate({
      target: [giveawayFetches.store, giveawayFetches.locale, giveawayFetches.country],
      set: {
        leaseToken: token,
        leaseExpiresAt: sql`now() + ${REFRESH_LEASE_SECONDS} * interval '1 second'`,
      },
      setWhere: and(
        or(isNull(giveawayFetches.fetchedAt), lte(giveawayFetches.freshUntil, sql`now()`)),
        or(
          isNull(giveawayFetches.failedAt),
          lte(
            giveawayFetches.failedAt,
            sql`now() - ${REFRESH_FAILURE_COOLDOWN_MINUTES} * interval '1 minute'`,
          ),
        ),
        or(isNull(giveawayFetches.leaseExpiresAt), lte(giveawayFetches.leaseExpiresAt, sql`now()`)),
      ),
    })
    .returning({ token: giveawayFetches.leaseToken });
  return rows[0]?.token === token ? token : null;
}

async function recordRefreshFailure(
  db: Database,
  scope: StoreScope,
  leaseToken: string,
): Promise<void> {
  await db
    .update(giveawayFetches)
    .set({ failedAt: sql`now()`, leaseToken: null, leaseExpiresAt: null })
    .where(and(fetchScopeWhere(scope), eq(giveawayFetches.leaseToken, leaseToken)));
}

type ReplaceSnapshotOptions = {
  db: Database;
  scope: StoreScope;
  items: Giveaway[];
  leaseToken: string;
};

async function replaceSnapshot(options: ReplaceSnapshotOptions): Promise<number | null> {
  const { db, scope, items, leaseToken } = options;
  const now = new Date();
  const deduped = new Map(items.map((item) => [item.id, item]));
  const rows = [...deduped.values()].map((item) => toRow(scope, item, now));
  const refreshDeadline = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);
  for (const row of rows) {
    if (row.freeUntil < refreshDeadline) refreshDeadline.setTime(row.freeUntil.getTime());
  }

  const replaced = await db.transaction(async (tx) => {
    const markers = await tx
      .select({ store: giveawayFetches.store })
      .from(giveawayFetches)
      .where(and(fetchScopeWhere(scope), eq(giveawayFetches.leaseToken, leaseToken)))
      .for("update");
    if (markers.length === 0) return false;

    await tx.update(giveaways).set({ isActive: false }).where(giveawayScopeWhere(scope));

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
      .set({
        fetchedAt: sql`now()`,
        freshUntil: refreshDeadline,
        failedAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(fetchScopeWhere(scope));
    return true;
  });

  return replaced ? rows.length : null;
}

async function findActiveGiveaways(db: Database, scope: StoreScope): Promise<Giveaway[]> {
  const rows = await db
    .select()
    .from(giveaways)
    .where(
      and(
        giveawayScopeWhere(scope),
        eq(giveaways.isActive, true),
        gt(giveaways.freeUntil, sql`now()`),
      ),
    );
  return rows.map(toGiveaway);
}

async function refreshScope(
  db: Database,
  scope: StoreScope,
  fetchFreeGames: FetchFreeGames,
): Promise<RefreshOutcome> {
  if (await isFresh(db, scope)) return { status: "fresh" };

  const leaseToken = await acquireRefreshLease(db, scope);
  if (leaseToken === null) {
    if (await isFresh(db, scope)) return { status: "fresh" };
    const hasSnapshot = await hasSuccessfulSnapshot(db, scope);
    log.debug({ ...scope, hasSnapshot }, "refresh deferred");
    return { status: hasSnapshot ? "degraded" : "unavailable" };
  }

  log.debug(scope, "store stale, fetching live");
  let live: Giveaway[];
  try {
    live = await fetchFreeGames({ locale: scope.locale, country: scope.country });
  } catch (error) {
    await recordRefreshFailure(db, scope, leaseToken);
    log.error({ ...scope, err: error }, "upstream fetch failed");
    return {
      status: (await hasSuccessfulSnapshot(db, scope)) ? "degraded" : "unavailable",
    };
  }

  const written = await replaceSnapshot({ db, scope, items: live, leaseToken });
  if (written === null) {
    return {
      status: (await hasSuccessfulSnapshot(db, scope)) ? "degraded" : "unavailable",
    };
  }
  log.info({ ...scope, count: written }, "cached live store giveaways");
  return { status: "refreshed" };
}

function coordinateRefresh(
  db: Database,
  adapters: StoreAdapters,
  scope: StoreScope,
): Promise<RefreshOutcome> {
  let refreshesByAdapter = refreshesByDatabase.get(db);
  if (refreshesByAdapter === undefined) {
    refreshesByAdapter = new WeakMap();
    refreshesByDatabase.set(db, refreshesByAdapter);
  }
  let refreshes = refreshesByAdapter.get(adapters);
  if (refreshes === undefined) {
    refreshes = new Map();
    refreshesByAdapter.set(adapters, refreshes);
  }
  const activeRefreshes = refreshes;

  const key = scopeKey(scope);
  const existing = activeRefreshes.get(key);
  if (existing) return existing;

  async function runRefresh(): Promise<RefreshOutcome> {
    try {
      return await refreshScope(db, scope, adapters[scope.store]);
    } finally {
      if (activeRefreshes.get(key) === refresh) activeRefreshes.delete(key);
    }
  }

  const refresh = runRefresh();
  activeRefreshes.set(key, refresh);
  return refresh;
}

export function createGiveawayCacheScopeResolver(
  getDatabase: () => Database,
  storeAdapters: StoreAdapters,
): ResolveGiveawayCacheScope {
  return async function resolveGiveawayCacheScope(
    store: StoreId,
    market: Market,
  ): Promise<GiveawayCacheScopeResolution> {
    const db = getDatabase();
    const scope = { ...market, store };
    const refresh = await coordinateRefresh(db, storeAdapters, scope);
    if (refresh.status === "unavailable") {
      return { availability: "unavailable", giveaways: [] };
    }

    return {
      availability: refresh.status === "degraded" ? "degraded" : "available",
      giveaways: await findActiveGiveaways(db, scope),
    };
  };
}
