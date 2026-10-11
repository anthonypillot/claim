import { and, desc, eq, gte, or, sql } from "drizzle-orm";

import type { Database } from "../../db/client.ts";
import {
  discordDeliveries,
  discordFollows,
  discordRuntime,
  discordSubscriptions,
  giveawayFetches,
} from "../../db/schema.ts";
import { STORE_IDS, type Market, type StoreId } from "../giveaways/model.ts";

export type SubscriptionSettings = Market & {
  channelId: string;
  stores: readonly StoreId[] | null;
};

type SubscriptionOptions = { clock?: () => Date; tokenFingerprint?: string };

const DIAGNOSTIC_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const STATUS_DIAGNOSTIC_LIMIT = 10;

export function createSubscriptions(
  getDatabase: () => Database,
  options: SubscriptionOptions = {},
) {
  const clock = options.clock ?? (() => new Date());

  async function setup(guildId: string, settings: SubscriptionSettings): Promise<void> {
    const db = getDatabase();

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${guildId}))`);

      const revision = crypto.randomUUID();
      const [previous] = await tx
        .select()
        .from(discordSubscriptions)
        .where(eq(discordSubscriptions.guildId, guildId))
        .for("update");

      const destinationUnchanged = previous?.channelId === settings.channelId;
      const preferences = {
        channelId: settings.channelId,
        locale: settings.locale,
        country: settings.country,
        stores: settings.stores ? [...settings.stores] : null,
        revision,
      };

      await tx
        .insert(discordSubscriptions)
        .values({
          guildId,
          ...preferences,
          nextCheckAt: clock(),
        })
        .onConflictDoUpdate({
          target: discordSubscriptions.guildId,
          set: {
            ...preferences,
            disabledAt: null,
            disabledReason: null,
            nextCheckAt: clock(),
            checkToken: null,
            checkExpiresAt: null,
            deliveryAfter: destinationUnchanged ? previous?.deliveryAfter : null,
          },
        });

      const marketUnchanged =
        previous?.locale === settings.locale && previous?.country === settings.country;
      const keepBaseline = Boolean(previous && !previous.disabledAt && marketUnchanged);
      const stores = settings.stores ?? STORE_IDS;

      const follows = await tx
        .select()
        .from(discordFollows)
        .where(eq(discordFollows.guildId, guildId));

      for (const follow of follows) {
        if (!keepBaseline || !stores.some((store) => store === follow.store)) {
          await tx
            .delete(discordFollows)
            .where(
              and(eq(discordFollows.guildId, guildId), eq(discordFollows.store, follow.store)),
            );
        }
      }

      for (const store of stores) {
        await tx.insert(discordFollows).values({ guildId, store }).onConflictDoNothing();
      }

      const queued = await tx
        .select()
        .from(discordDeliveries)
        .where(
          and(
            eq(discordDeliveries.guildId, guildId),
            or(eq(discordDeliveries.state, "pending"), eq(discordDeliveries.state, "retry")),
          ),
        );

      for (const work of queued) {
        const compatible =
          keepBaseline && destinationUnchanged && stores.some((store) => store === work.store);
        await tx
          .update(discordDeliveries)
          .set(compatible ? { revision } : { state: "cancelled", updatedAt: clock() })
          .where(eq(discordDeliveries.id, work.id));
      }
    });
  }

  async function status(guildId: string): Promise<string> {
    const db = getDatabase();

    const [subscription] = await db
      .select()
      .from(discordSubscriptions)
      .where(eq(discordSubscriptions.guildId, guildId));
    if (!subscription) return "No subscription. Use /claim setup to get started.";

    const follows = await db
      .select()
      .from(discordFollows)
      .where(eq(discordFollows.guildId, guildId));

    const refreshes = await db
      .select()
      .from(giveawayFetches)
      .where(
        and(
          eq(giveawayFetches.locale, subscription.locale),
          eq(giveawayFetches.country, subscription.country),
        ),
      );

    const readiness = STORE_IDS.filter(
      (store) => !subscription.stores || subscription.stores.includes(store),
    ).map((store) => {
      const baseline = follows.find((follow) => follow.store === store)?.baselineAt;
      const refresh = refreshes.find((row) => row.store === store);
      const failure = refresh?.failedAt
        ? ` (refresh failed; last success: ${refresh.fetchedAt?.toISOString() ?? "none"})`
        : "";
      return `${store}: ${baseline ? "ready" : "waiting for baseline"}${failure}`;
    });

    const paused = await db
      .select()
      .from(discordRuntime)
      .where(
        and(
          eq(discordRuntime.paused, true),
          options.tokenFingerprint
            ? eq(discordRuntime.tokenFingerprint, options.tokenFingerprint)
            : undefined,
        ),
      )
      .limit(1);

    const recent = await db
      .select()
      .from(discordDeliveries)
      .where(
        and(
          eq(discordDeliveries.guildId, guildId),
          gte(discordDeliveries.updatedAt, new Date(clock().getTime() - DIAGNOSTIC_RETENTION_MS)),
        ),
      )
      .orderBy(desc(discordDeliveries.updatedAt))
      .limit(STATUS_DIAGNOSTIC_LIMIT);

    const subscriptionState = subscription.disabledAt
      ? `Disabled: ${subscription.disabledReason}`
      : "Active";
    const globalDeliveryState = paused.length ? "Delivery paused globally: invalid bot token." : "";
    const recentDeliveries = recent
      .map((delivery) => `${delivery.store}: ${delivery.state}`)
      .join(", ");

    return [
      `Channel: <#${subscription.channelId}>`,
      `Market: ${subscription.locale}/${subscription.country}`,
      `Stores: ${subscription.stores?.join(", ") ?? "all"}`,
      readiness.join("\n"),
      subscriptionState,
      globalDeliveryState,
      `Recent deliveries: ${recentDeliveries || "none"}`,
    ].join("\n");
  }

  async function stop(guildId: string): Promise<void> {
    await getDatabase().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${guildId}))`);
      await tx.delete(discordSubscriptions).where(eq(discordSubscriptions.guildId, guildId));
    });
  }

  return { setup, status, stop };
}
