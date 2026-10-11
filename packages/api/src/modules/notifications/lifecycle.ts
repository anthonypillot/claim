import { and, eq, isNull, lte, or } from "drizzle-orm";

import type { Database } from "../../db/client.ts";
import { discordRuntime, discordSubscriptions } from "../../db/schema.ts";
import type { DiscordClient } from "../discord/client.ts";
import { recordDestinationBackoff } from "./backoff.ts";

type LifecycleOptions = {
  db: Database;
  client: DiscordClient;
  clock: () => Date;
  checkIntervalMs: number;
  signal?: AbortSignal;
};

type PresenceOutcome = Awaited<ReturnType<DiscordClient["presence"]>>;

const MEMBERSHIP_CHECK_BATCH_SIZE = 25;
const MEMBERSHIP_CLAIM_LEASE_MS = 60_000;
const UNKNOWN_PRESENCE_RECHECK_MS = 60 * 60 * 1000;

async function isDeliveryBlocked(
  db: Database,
  tokenFingerprint: string,
  clock: () => Date,
): Promise<boolean> {
  const [runtime] = await db
    .select()
    .from(discordRuntime)
    .where(eq(discordRuntime.tokenFingerprint, tokenFingerprint));

  return Boolean(runtime?.paused || (runtime?.blockedUntil && runtime.blockedUntil > clock()));
}

function presenceRecheckDelay(outcome: PresenceOutcome, checkIntervalMs: number): number {
  if (outcome.kind === "retry") return outcome.retryAfterMs;
  if (outcome.kind === "unknown") return UNKNOWN_PRESENCE_RECHECK_MS;

  return checkIntervalMs;
}

export async function checkSubscriptions(options: LifecycleOptions): Promise<void> {
  const { db, client, clock, checkIntervalMs } = options;

  if (await isDeliveryBlocked(db, client.tokenFingerprint, clock)) return;

  const due = await db
    .select()
    .from(discordSubscriptions)
    .where(
      and(
        lte(discordSubscriptions.nextCheckAt, clock()),
        or(
          isNull(discordSubscriptions.checkExpiresAt),
          lte(discordSubscriptions.checkExpiresAt, clock()),
        ),
      ),
    )
    .orderBy(discordSubscriptions.nextCheckAt)
    .limit(MEMBERSHIP_CHECK_BATCH_SIZE);

  for (const subscription of due) {
    if (options.signal?.aborted) return;
    if (await isDeliveryBlocked(db, client.tokenFingerprint, clock)) return;

    const token = crypto.randomUUID();
    const claimed = await db
      .update(discordSubscriptions)
      .set({
        checkToken: token,
        checkExpiresAt: new Date(clock().getTime() + MEMBERSHIP_CLAIM_LEASE_MS),
      })
      .where(
        and(
          eq(discordSubscriptions.guildId, subscription.guildId),
          eq(discordSubscriptions.revision, subscription.revision),
          lte(discordSubscriptions.nextCheckAt, clock()),
          or(
            isNull(discordSubscriptions.checkExpiresAt),
            lte(discordSubscriptions.checkExpiresAt, clock()),
          ),
        ),
      )
      .returning();
    if (!claimed.length) continue;

    const outcome = await client.presence(subscription.guildId);
    const fence = and(
      eq(discordSubscriptions.guildId, subscription.guildId),
      eq(discordSubscriptions.revision, subscription.revision),
      eq(discordSubscriptions.checkToken, token),
    );

    if (outcome.kind === "removed") {
      await db.delete(discordSubscriptions).where(fence);
      continue;
    }

    await db
      .update(discordSubscriptions)
      .set({
        checkToken: null,
        checkExpiresAt: null,
        nextCheckAt: new Date(clock().getTime() + presenceRecheckDelay(outcome, checkIntervalMs)),
      })
      .where(fence);

    if (outcome.kind === "retry") {
      await recordDestinationBackoff({
        db,
        guildId: subscription.guildId,
        channelId: subscription.channelId,
        until: new Date(clock().getTime() + outcome.retryAfterMs),
      });
      if (outcome.global) return;
    }

    if (outcome.kind === "invalid-token") {
      return;
    }
  }
}
