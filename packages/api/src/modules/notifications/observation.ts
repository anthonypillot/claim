import { and, eq, isNull, sql } from "drizzle-orm";

import type { Transaction } from "../../db/client.ts";
import {
  discordDeliveries,
  discordFollows,
  discordSubscriptions,
  giveawayOccurrences,
} from "../../db/schema.ts";
import type { Giveaway, Market, StoreId } from "../giveaways/model.ts";

type Observation = {
  tx: Transaction;
  scope: Market & { store: StoreId };
  items: readonly Giveaway[];
  now: Date;
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
  const active = new Map(
    items
      .filter((item) => Date.parse(item.freeUntil) > now.getTime())
      .map((item) => [item.id, item]),
  );
  const previousById = new Map(history.map((row) => [row.id, row]));
  const newOccurrences: { id: string; occurrenceId: string }[] = [];
  for (const row of history)
    if (!active.has(row.id)) {
      await tx
        .update(giveawayOccurrences)
        .set({ active: false, endedAt: row.endedAt ?? (row.freeUntil <= now ? now : null) })
        .where(
          and(
            eq(giveawayOccurrences.store, scope.store),
            eq(giveawayOccurrences.locale, scope.locale),
            eq(giveawayOccurrences.country, scope.country),
            eq(giveawayOccurrences.id, row.id),
          ),
        );
    }
  for (const item of active.values()) {
    const previous = previousById.get(item.id);
    const isNew = !previous || previous.endedAt !== null;
    const occurrenceId = isNew ? crypto.randomUUID() : previous.occurrenceId;
    const detectedAt = isNew ? now : previous.detectedAt;
    await tx
      .insert(giveawayOccurrences)
      .values({
        ...scope,
        id: item.id,
        occurrenceId,
        detectedAt,
        freeUntil: new Date(item.freeUntil),
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
          freeUntil: new Date(item.freeUntil),
          active: true,
          endedAt: null,
        },
      });
    if (isNew) newOccurrences.push({ id: item.id, occurrenceId });
  }
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
    for (const occurrence of newOccurrences)
      await tx
        .insert(discordDeliveries)
        .values({
          id: `${subscription.guildId}:${occurrence.occurrenceId}`,
          guildId: subscription.guildId,
          channelId: subscription.channelId,
          revision: subscription.revision,
          ...scope,
          listingId: occurrence.id,
          occurrenceId: occurrence.occurrenceId,
          detectedAt: now,
          updatedAt: now,
          availableAt: now,
          state: "pending",
        })
        .onConflictDoNothing();
  }
}
