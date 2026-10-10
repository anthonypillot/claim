import { and, eq, isNull, lte, or } from "drizzle-orm";

import type { Database } from "../../db/client.ts";
import {
  discordDeliveries,
  discordInteractions,
  discordRuntime,
  discordRateLimits,
  discordSubscriptions,
  giveawayOccurrences,
  giveaways,
} from "../../db/schema.ts";
import { createLogger } from "../../utils/logger.ts";
import type { DiscordClient } from "../discord/client.ts";
import { STORE_IDS } from "../giveaways/model.ts";
import type { ResolveGiveawayCacheScope } from "../giveaways/cache-scope.ts";
import { checkSubscriptions } from "./lifecycle.ts";
import { createAlertMessage } from "./message.ts";
import { recordDestinationBackoff } from "./backoff.ts";

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

export function createNotifications(options: NotificationsOptions) {
  const clock = options.clock ?? (() => new Date());
  async function runOnce(): Promise<void> {
    if (options.signal?.aborted) return;
    const db = options.getDatabase();
    await db
      .insert(discordRuntime)
      .values({ tokenFingerprint: options.client.tokenFingerprint })
      .onConflictDoNothing();
    const cutoff = new Date(clock().getTime() - 30 * 86400000);
    await db.delete(discordSubscriptions).where(lte(discordSubscriptions.disabledAt, cutoff));
    await db.delete(discordDeliveries).where(lte(discordDeliveries.detectedAt, cutoff));
    await db.delete(discordInteractions).where(lte(discordInteractions.expiresAt, clock()));
    await db.delete(discordRateLimits).where(lte(discordRateLimits.blockedUntil, clock()));
    await checkSubscriptions({
      db,
      client: options.client,
      clock,
      checkIntervalMs: options.membershipCheckIntervalMs ?? 86400000,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    await db
      .update(discordDeliveries)
      .set({ state: "unknown", updatedAt: clock() })
      .where(
        and(
          eq(discordDeliveries.state, "attempting"),
          lte(discordDeliveries.attemptExpiresAt, clock()),
        ),
      );
    const subscriptions = await db
      .select()
      .from(discordSubscriptions)
      .where(isNull(discordSubscriptions.disabledAt));
    const scopes = new Map<
      string,
      { store: (typeof STORE_IDS)[number]; locale: string; country: string }
    >();
    for (const subscription of subscriptions)
      for (const store of STORE_IDS)
        if (!subscription.stores || subscription.stores.includes(store)) {
          const scope = { store, locale: subscription.locale, country: subscription.country };
          scopes.set(`${store}:${scope.locale}:${scope.country}`, scope);
        }
    for (const scope of scopes.values()) {
      if (options.signal?.aborted) return;
      try {
        await options.resolve(scope.store, scope);
      } catch {
        log.error({ store: scope.store }, "monitoring failed");
      }
    }
    const pending = await db
      .select({ delivery: discordDeliveries })
      .from(discordDeliveries)
      .innerJoin(discordSubscriptions, eq(discordSubscriptions.guildId, discordDeliveries.guildId))
      .where(
        and(
          or(eq(discordDeliveries.state, "pending"), eq(discordDeliveries.state, "retry")),
          lte(discordDeliveries.availableAt, clock()),
          isNull(discordSubscriptions.disabledAt),
          or(
            isNull(discordSubscriptions.deliveryAfter),
            lte(discordSubscriptions.deliveryAfter, clock()),
          ),
          eq(discordSubscriptions.revision, discordDeliveries.revision),
        ),
      )
      .orderBy(discordDeliveries.detectedAt, discordDeliveries.id)
      .limit(50);
    for (const { delivery } of pending) {
      if (options.signal?.aborted) return;
      const claimed = await db.transaction(async (tx) => {
        const [runtime] = await tx
          .select()
          .from(discordRuntime)
          .where(eq(discordRuntime.tokenFingerprint, options.client.tokenFingerprint))
          .for("update");
        if (runtime?.paused || (runtime?.blockedUntil && runtime.blockedUntil > clock()))
          return null;
        const [subscription] = await tx
          .select()
          .from(discordSubscriptions)
          .where(eq(discordSubscriptions.guildId, delivery.guildId))
          .for("update");
        if (subscription?.deliveryAfter && subscription.deliveryAfter > clock()) return null;
        const [work] = await tx
          .select()
          .from(discordDeliveries)
          .where(eq(discordDeliveries.id, delivery.id))
          .for("update");
        if (
          !work ||
          (work.state !== "pending" && work.state !== "retry") ||
          work.availableAt > clock()
        )
          return null;
        async function finish(state: "cancelled" | "expired"): Promise<null> {
          await tx
            .update(discordDeliveries)
            .set({ state, updatedAt: clock() })
            .where(eq(discordDeliveries.id, delivery.id));
          return null;
        }
        if (
          !subscription ||
          subscription.disabledAt ||
          subscription.revision !== work.revision ||
          subscription.channelId !== work.channelId ||
          subscription.locale !== work.locale ||
          subscription.country !== work.country ||
          (subscription.stores && !subscription.stores.includes(work.store))
        )
          return await finish("cancelled");
        if (clock().getTime() - work.detectedAt.getTime() >= (options.maxAlertAgeMs ?? 86400000))
          return await finish("expired");
        const [occurrence] = await tx
          .select()
          .from(giveawayOccurrences)
          .where(
            and(
              eq(giveawayOccurrences.store, delivery.store),
              eq(giveawayOccurrences.id, delivery.listingId),
              eq(giveawayOccurrences.locale, delivery.locale),
              eq(giveawayOccurrences.country, delivery.country),
            ),
          );
        const [game] = await tx
          .select()
          .from(giveaways)
          .where(
            and(
              eq(giveaways.store, delivery.store),
              eq(giveaways.id, delivery.listingId),
              eq(giveaways.locale, delivery.locale),
              eq(giveaways.country, delivery.country),
            ),
          );
        if (
          !game ||
          !game.isActive ||
          !occurrence?.active ||
          occurrence.occurrenceId !== delivery.occurrenceId
        )
          return await finish("cancelled");
        if (game.freeUntil <= clock()) return await finish("expired");
        if (options.signal?.aborted) return null;
        const token = crypto.randomUUID();
        await tx
          .update(discordDeliveries)
          .set({
            state: "attempting",
            attemptToken: token,
            attemptExpiresAt: new Date(clock().getTime() + 60000),
            updatedAt: clock(),
          })
          .where(eq(discordDeliveries.id, delivery.id));
        return { game, token, work };
      });
      if (!claimed) continue;
      const outcome = await options.client.send(
        delivery.channelId,
        createAlertMessage({
          game: claimed.game,
          deliveryId: delivery.id,
          channelId: delivery.channelId,
          webUrl: options.webUrl ?? "https://claim.anthonypillot.com",
        }),
      );
      if (outcome.kind === "invalid-token") {
        log.error(
          "Discord delivery paused: invalid bot token; configure a corrected token and restart",
        );
      }
      if (outcome.kind === "inaccessible") {
        await db
          .update(discordSubscriptions)
          .set({
            disabledAt: clock(),
            disabledReason:
              "Destination missing or bot permissions lost; run /claim setup to repair.",
          })
          .where(
            and(
              eq(discordSubscriptions.guildId, delivery.guildId),
              eq(discordSubscriptions.revision, claimed.work.revision),
              isNull(discordSubscriptions.disabledAt),
            ),
          );
      }
      if (outcome.kind === "retry" || (outcome.kind === "sent" && outcome.retryAfterMs > 0)) {
        const until = new Date(clock().getTime() + outcome.retryAfterMs);
        await recordDestinationBackoff({
          db,
          guildId: delivery.guildId,
          channelId: claimed.work.channelId,
          until,
        });
      }
      await db
        .update(discordDeliveries)
        .set({
          state:
            outcome.kind === "sent"
              ? "sent"
              : outcome.kind === "retry"
                ? "retry"
                : outcome.kind === "invalid-token" ||
                    outcome.kind === "rejected" ||
                    outcome.kind === "inaccessible"
                  ? "rejected"
                  : "unknown",
          messageId: outcome.kind === "sent" ? outcome.messageId : null,
          availableAt:
            outcome.kind === "retry" ? new Date(clock().getTime() + outcome.retryAfterMs) : clock(),
          updatedAt: clock(),
        })
        .where(
          and(
            eq(discordDeliveries.id, delivery.id),
            eq(discordDeliveries.attemptToken, claimed.token),
            eq(discordDeliveries.state, "attempting"),
          ),
        );
    }
  }
  return { runOnce };
}
