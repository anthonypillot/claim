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
      await tx
        .insert(discordSubscriptions)
        .values({
          guildId,
          channelId: settings.channelId,
          locale: settings.locale,
          country: settings.country,
          nextCheckAt: clock(),
          stores: settings.stores ? [...settings.stores] : null,
          revision,
        })
        .onConflictDoUpdate({
          target: discordSubscriptions.guildId,
          set: {
            channelId: settings.channelId,
            locale: settings.locale,
            country: settings.country,
            stores: settings.stores ? [...settings.stores] : null,
            revision,
            disabledAt: null,
            disabledReason: null,
            nextCheckAt: clock(),
            checkToken: null,
            checkExpiresAt: null,
            deliveryAfter:
              previous?.channelId === settings.channelId ? previous.deliveryAfter : null,
          },
        });
      const keepBaseline =
        previous &&
        !previous.disabledAt &&
        previous.locale === settings.locale &&
        previous.country === settings.country;
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
      for (const store of stores)
        await tx.insert(discordFollows).values({ guildId, store }).onConflictDoNothing();
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
          keepBaseline &&
          previous.channelId === settings.channelId &&
          stores.some((store) => store === work.store);
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
          gte(discordDeliveries.updatedAt, new Date(clock().getTime() - 30 * 86400000)),
        ),
      )
      .orderBy(desc(discordDeliveries.updatedAt))
      .limit(10);
    return `Channel: <#${subscription.channelId}>\nMarket: ${subscription.locale}/${subscription.country}\nStores: ${subscription.stores?.join(", ") ?? "all"}\n${readiness.join("\n")}\n${subscription.disabledAt ? `Disabled: ${subscription.disabledReason}` : "Active"}\n${paused.length ? "Delivery paused globally: invalid bot token." : ""}\nRecent deliveries: ${recent.map((work) => `${work.store}: ${work.state}`).join(", ") || "none"}`;
  }
  async function stop(guildId: string): Promise<void> {
    await getDatabase().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${guildId}))`);
      await tx.delete(discordSubscriptions).where(eq(discordSubscriptions.guildId, guildId));
    });
  }
  return { setup, status, stop };
}
