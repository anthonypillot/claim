import { and, eq, isNull, lte } from "drizzle-orm";

import type { Database } from "../../db/client.ts";
import {
  discordDeliveries,
  discordInteractions,
  discordRuntime,
  discordRateLimits,
  discordSubscriptions,
} from "../../db/schema.ts";
import { createLogger } from "../../utils/logger.ts";
import type { DiscordClient } from "../discord/client.ts";
import { STORE_IDS, type Market, type StoreId } from "../giveaways/model.ts";
import type { ResolveGiveawayCacheScope } from "../giveaways/cache-scope.ts";
import { checkSubscriptions } from "./lifecycle.ts";
import { deliverDueAlerts } from "./deliveries.ts";

type NotificationsOptions = {
  getDatabase: () => Database;
  resolve: ResolveGiveawayCacheScope;
  client: DiscordClient;
  clock?: () => Date;
  maxAlertAgeMs?: number;
  membershipCheckIntervalMs?: number;
  webUrl?: string;
  signal?: AbortSignal;
};

const log = createLogger("giveaway alerts");
const DATA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MEMBERSHIP_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

type MonitoredScope = Market & { store: StoreId };

export function createNotifications(options: NotificationsOptions) {
  const clock = options.clock ?? (() => new Date());

  async function purgeExpiredData(db: Database): Promise<void> {
    const cutoff = new Date(clock().getTime() - DATA_RETENTION_MS);

    await db.delete(discordSubscriptions).where(lte(discordSubscriptions.disabledAt, cutoff));
    await db.delete(discordDeliveries).where(lte(discordDeliveries.detectedAt, cutoff));
    await db.delete(discordInteractions).where(lte(discordInteractions.expiresAt, clock()));
    await db.delete(discordRateLimits).where(lte(discordRateLimits.blockedUntil, clock()));
  }

  async function recoverUncertainAttempts(db: Database): Promise<void> {
    // Recovery records uncertainty; it never makes a started attempt eligible for another send.
    await db
      .update(discordDeliveries)
      .set({ state: "unknown", updatedAt: clock() })
      .where(
        and(
          eq(discordDeliveries.state, "attempting"),
          lte(discordDeliveries.attemptExpiresAt, clock()),
        ),
      );
  }

  async function findMonitoredScopes(db: Database): Promise<MonitoredScope[]> {
    const subscriptions = await db
      .select()
      .from(discordSubscriptions)
      .where(isNull(discordSubscriptions.disabledAt));

    const scopes = new Map<string, MonitoredScope>();

    for (const subscription of subscriptions) {
      for (const store of STORE_IDS) {
        if (subscription.stores && !subscription.stores.includes(store)) continue;

        const scope = { store, locale: subscription.locale, country: subscription.country };
        scopes.set(`${store}:${scope.locale}:${scope.country}`, scope);
      }
    }

    return [...scopes.values()];
  }

  async function refreshMonitoredScopes(db: Database): Promise<boolean> {
    const scopes = await findMonitoredScopes(db);

    for (const scope of scopes) {
      if (options.signal?.aborted) return false;

      try {
        await options.resolve(scope.store, scope);
      } catch {
        log.error({ store: scope.store }, "monitoring failed");
      }
    }

    return true;
  }

  async function runOnce(): Promise<void> {
    if (options.signal?.aborted) return;

    const db = options.getDatabase();
    await db
      .insert(discordRuntime)
      .values({ tokenFingerprint: options.client.tokenFingerprint })
      .onConflictDoNothing();

    await purgeExpiredData(db);
    await checkSubscriptions({
      db,
      client: options.client,
      clock,
      checkIntervalMs: options.membershipCheckIntervalMs ?? DEFAULT_MEMBERSHIP_CHECK_INTERVAL_MS,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    await recoverUncertainAttempts(db);

    if (!(await refreshMonitoredScopes(db))) return;

    await deliverDueAlerts(db, {
      client: options.client,
      clock,
      maxAlertAgeMs: options.maxAlertAgeMs,
      webUrl: options.webUrl,
      signal: options.signal,
    });
  }

  return { runOnce };
}
