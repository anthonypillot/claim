import { and, eq, isNull, lte, or } from "drizzle-orm";

import type { Database } from "../../db/client.ts";
import {
  discordDeliveries,
  discordRuntime,
  discordSubscriptions,
  giveawayOccurrences,
  giveaways,
  type GiveawayRow,
} from "../../db/schema.ts";
import { createLogger } from "../../utils/logger.ts";
import type { DiscordClient, SendOutcome } from "../discord/client.ts";
import { recordDestinationBackoff } from "./backoff.ts";
import { createAlertMessage } from "./message.ts";

const DEFAULT_ALERT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ATTEMPT_LEASE_MS = 60_000;
const DELIVERY_BATCH_SIZE = 50;
const DEFAULT_WEB_URL = "https://claim.anthonypillot.com";
const log = createLogger("giveaway alerts");

type Delivery = typeof discordDeliveries.$inferSelect;
type Subscription = typeof discordSubscriptions.$inferSelect;

type DeliveryAttempt = {
  giveaway: GiveawayRow;
  attemptToken: string;
  delivery: Delivery;
};

type DeliveryResult = DeliveryAttempt & { outcome: SendOutcome };

type DeliveryOptions = {
  client: DiscordClient;
  clock: () => Date;
  maxAlertAgeMs?: number;
  webUrl?: string;
  signal?: AbortSignal;
};

function subscriptionMatchesDelivery(subscription: Subscription, delivery: Delivery): boolean {
  return (
    !subscription.disabledAt &&
    subscription.revision === delivery.revision &&
    subscription.channelId === delivery.channelId &&
    subscription.locale === delivery.locale &&
    subscription.country === delivery.country &&
    (!subscription.stores || subscription.stores.includes(delivery.store))
  );
}

function deliveryStateForOutcome(outcome: SendOutcome): Delivery["state"] {
  switch (outcome.kind) {
    case "sent":
      return "sent";
    case "retry":
      return "retry";
    case "invalid-token":
    case "inaccessible":
    case "rejected":
      return "rejected";
    case "unknown":
      return "unknown";
  }
}

async function findDueDeliveries(db: Database, clock: () => Date): Promise<Delivery[]> {
  const rows = await db
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
    .limit(DELIVERY_BATCH_SIZE);

  return rows.map(({ delivery }) => delivery);
}

async function claimDelivery(
  db: Database,
  candidate: Delivery,
  options: DeliveryOptions,
): Promise<DeliveryAttempt | null> {
  const { clock } = options;

  return await db.transaction(async (tx) => {
    // Keep this lock order: runtime, subscription, delivery.
    // The subscription lock serializes claims with settings changes.
    const [runtime] = await tx
      .select()
      .from(discordRuntime)
      .where(eq(discordRuntime.tokenFingerprint, options.client.tokenFingerprint))
      .for("update");

    if (runtime?.paused || (runtime?.blockedUntil && runtime.blockedUntil > clock())) {
      return null;
    }

    const [subscription] = await tx
      .select()
      .from(discordSubscriptions)
      .where(eq(discordSubscriptions.guildId, candidate.guildId))
      .for("update");

    if (subscription?.deliveryAfter && subscription.deliveryAfter > clock()) {
      return null;
    }

    const [delivery] = await tx
      .select()
      .from(discordDeliveries)
      .where(eq(discordDeliveries.id, candidate.id))
      .for("update");

    if (
      !delivery ||
      (delivery.state !== "pending" && delivery.state !== "retry") ||
      delivery.availableAt > clock()
    ) {
      return null;
    }

    async function finishWithoutSending(state: "cancelled" | "expired"): Promise<null> {
      await tx
        .update(discordDeliveries)
        .set({ state, updatedAt: clock() })
        .where(eq(discordDeliveries.id, candidate.id));

      return null;
    }

    if (!subscription || !subscriptionMatchesDelivery(subscription, delivery)) {
      return await finishWithoutSending("cancelled");
    }

    const alertAgeMs = clock().getTime() - delivery.detectedAt.getTime();
    if (alertAgeMs >= (options.maxAlertAgeMs ?? DEFAULT_ALERT_MAX_AGE_MS)) {
      return await finishWithoutSending("expired");
    }

    const [occurrence] = await tx
      .select()
      .from(giveawayOccurrences)
      .where(
        and(
          eq(giveawayOccurrences.store, candidate.store),
          eq(giveawayOccurrences.id, candidate.listingId),
          eq(giveawayOccurrences.locale, candidate.locale),
          eq(giveawayOccurrences.country, candidate.country),
        ),
      );

    const [giveaway] = await tx
      .select()
      .from(giveaways)
      .where(
        and(
          eq(giveaways.store, candidate.store),
          eq(giveaways.id, candidate.listingId),
          eq(giveaways.locale, candidate.locale),
          eq(giveaways.country, candidate.country),
        ),
      );

    const isStillAvailable =
      giveaway?.isActive &&
      occurrence?.active &&
      occurrence.occurrenceId === candidate.occurrenceId;
    if (!giveaway || !isStillAvailable) {
      return await finishWithoutSending("cancelled");
    }

    if (giveaway.freeUntil <= clock()) {
      return await finishWithoutSending("expired");
    }

    if (options.signal?.aborted) return null;

    const attemptToken = crypto.randomUUID();
    await tx
      .update(discordDeliveries)
      .set({
        state: "attempting",
        attemptToken,
        attemptExpiresAt: new Date(clock().getTime() + ATTEMPT_LEASE_MS),
        updatedAt: clock(),
      })
      .where(eq(discordDeliveries.id, candidate.id));

    return { giveaway, attemptToken, delivery };
  });
}

async function recordDeliveryResult(
  db: Database,
  result: DeliveryResult,
  options: DeliveryOptions,
): Promise<void> {
  const { delivery, attemptToken, outcome } = result;
  const { clock } = options;

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
        disabledReason: "Destination missing or bot permissions lost; run /claim setup to repair.",
      })
      .where(
        and(
          eq(discordSubscriptions.guildId, delivery.guildId),
          eq(discordSubscriptions.revision, delivery.revision),
          isNull(discordSubscriptions.disabledAt),
        ),
      );
  }

  if (outcome.kind === "retry" || (outcome.kind === "sent" && outcome.retryAfterMs > 0)) {
    await recordDestinationBackoff({
      db,
      guildId: delivery.guildId,
      channelId: delivery.channelId,
      until: new Date(clock().getTime() + outcome.retryAfterMs),
    });
  }

  await db
    .update(discordDeliveries)
    .set({
      state: deliveryStateForOutcome(outcome),
      messageId: outcome.kind === "sent" ? outcome.messageId : null,
      availableAt:
        outcome.kind === "retry" ? new Date(clock().getTime() + outcome.retryAfterMs) : clock(),
      updatedAt: clock(),
    })
    .where(
      and(
        eq(discordDeliveries.id, delivery.id),
        eq(discordDeliveries.attemptToken, attemptToken),
        eq(discordDeliveries.state, "attempting"),
      ),
    );
}

export async function deliverDueAlerts(db: Database, options: DeliveryOptions): Promise<void> {
  const deliveries = await findDueDeliveries(db, options.clock);

  for (const delivery of deliveries) {
    if (options.signal?.aborted) return;

    const attempt = await claimDelivery(db, delivery, options);
    if (!attempt) continue;

    // The attempt is committed before HTTP. An uncertain attempt must never become sendable again.
    const outcome = await options.client.send(
      delivery.channelId,
      createAlertMessage({
        game: attempt.giveaway,
        deliveryId: delivery.id,
        channelId: delivery.channelId,
        webUrl: options.webUrl ?? DEFAULT_WEB_URL,
      }),
    );

    await recordDeliveryResult(db, { ...attempt, outcome }, options);
  }
}
