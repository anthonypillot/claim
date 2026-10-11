import { and, eq, isNull, sql } from "drizzle-orm";

import type { Transaction } from "../../db/client.ts";
import {
  discordDeliveries,
  discordFollows,
  discordSubscriptions,
  giveawayOccurrences,
} from "../../db/schema.ts";
import type { Giveaway, Market, StoreId } from "../giveaways/model.ts";

type ObservationContext = {
  tx: Transaction;
  scope: Market & { store: StoreId };
  now: Date;
};

type Observation = ObservationContext & { items: readonly Giveaway[] };

type Occurrence = typeof giveawayOccurrences.$inferSelect;
type Subscription = typeof discordSubscriptions.$inferSelect;
type DetectedOccurrence = { listingId: string; occurrenceId: string };

type OccurrenceChanges = ObservationContext & {
  history: readonly Occurrence[];
  activeGiveaways: ReadonlyMap<string, Giveaway>;
};

type EligibleAlerts = ObservationContext & {
  subscriptions: readonly Subscription[];
  newOccurrences: readonly DetectedOccurrence[];
};

// Called inside snapshot replacement, while the refresh marker is fenced and locked.
export async function recordSuccessfulObservation(observation: Observation): Promise<void> {
  const { tx, scope, items, now } = observation;

  const subscriptions = await tx
    .select()
    .from(discordSubscriptions)
    .where(
      and(
        isNull(discordSubscriptions.disabledAt),
        eq(discordSubscriptions.locale, scope.locale),
        eq(discordSubscriptions.country, scope.country),
        sql`(${discordSubscriptions.stores} is null or ${scope.store} = any(${discordSubscriptions.stores}))`,
      ),
    )
    .orderBy(discordSubscriptions.guildId)
    .for("update");

  const history = await tx
    .select()
    .from(giveawayOccurrences)
    .where(
      and(
        eq(giveawayOccurrences.store, scope.store),
        eq(giveawayOccurrences.locale, scope.locale),
        eq(giveawayOccurrences.country, scope.country),
      ),
    );

  if (!subscriptions.length && !history.length) return;

  const activeGiveaways = new Map(
    items
      .filter((item) => Date.parse(item.freeUntil) > now.getTime())
      .map((item) => [item.id, item]),
  );

  const newOccurrences = await persistOccurrenceChanges({
    tx,
    scope,
    now,
    history,
    activeGiveaways,
  });

  await establishBaselinesAndQueueAlerts({ tx, scope, now, subscriptions, newOccurrences });
}

async function persistOccurrenceChanges(changes: OccurrenceChanges): Promise<DetectedOccurrence[]> {
  const { tx, scope, now, history, activeGiveaways } = changes;

  const previousById = new Map(history.map((row) => [row.id, row]));
  const newOccurrences: DetectedOccurrence[] = [];

  for (const previous of history) {
    if (activeGiveaways.has(previous.id)) continue;

    // An absence before the old deadline is not proof that its giveaway period ended.
    const observedEnd = previous.endedAt ?? (previous.freeUntil <= now ? now : null);
    await tx
      .update(giveawayOccurrences)
      .set({ active: false, endedAt: observedEnd })
      .where(
        and(
          eq(giveawayOccurrences.store, scope.store),
          eq(giveawayOccurrences.locale, scope.locale),
          eq(giveawayOccurrences.country, scope.country),
          eq(giveawayOccurrences.id, previous.id),
        ),
      );
  }

  for (const giveaway of activeGiveaways.values()) {
    const previous = previousById.get(giveaway.id);
    const isNewOccurrence = !previous || previous.endedAt !== null;
    const occurrenceId = isNewOccurrence ? crypto.randomUUID() : previous.occurrenceId;
    const detectedAt = isNewOccurrence ? now : previous.detectedAt;

    await tx
      .insert(giveawayOccurrences)
      .values({
        ...scope,
        id: giveaway.id,
        occurrenceId,
        detectedAt,
        freeUntil: new Date(giveaway.freeUntil),
        active: true,
        endedAt: null,
      })
      .onConflictDoUpdate({
        target: [
          giveawayOccurrences.store,
          giveawayOccurrences.id,
          giveawayOccurrences.locale,
          giveawayOccurrences.country,
        ],
        set: {
          occurrenceId,
          detectedAt,
          freeUntil: new Date(giveaway.freeUntil),
          active: true,
          endedAt: null,
        },
      });

    if (isNewOccurrence) {
      newOccurrences.push({ listingId: giveaway.id, occurrenceId });
    }
  }

  return newOccurrences;
}

async function establishBaselinesAndQueueAlerts(alerts: EligibleAlerts): Promise<void> {
  const { tx, scope, now, subscriptions, newOccurrences } = alerts;

  for (const subscription of subscriptions) {
    await tx
      .insert(discordFollows)
      .values({ guildId: subscription.guildId, store: scope.store })
      .onConflictDoNothing();

    const [follow] = await tx
      .select()
      .from(discordFollows)
      .where(
        and(
          eq(discordFollows.guildId, subscription.guildId),
          eq(discordFollows.store, scope.store),
        ),
      );

    if (!follow?.baselineAt) {
      await tx
        .update(discordFollows)
        .set({ baselineAt: now })
        .where(
          and(
            eq(discordFollows.guildId, subscription.guildId),
            eq(discordFollows.store, scope.store),
          ),
        );
      continue;
    }

    for (const occurrence of newOccurrences) {
      await tx
        .insert(discordDeliveries)
        .values({
          id: `${subscription.guildId}:${occurrence.occurrenceId}`,
          guildId: subscription.guildId,
          channelId: subscription.channelId,
          revision: subscription.revision,
          ...scope,
          listingId: occurrence.listingId,
          occurrenceId: occurrence.occurrenceId,
          detectedAt: now,
          updatedAt: now,
          availableAt: now,
          state: "pending",
        })
        .onConflictDoNothing();
    }
  }
}
