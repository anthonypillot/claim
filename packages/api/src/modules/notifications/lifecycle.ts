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

export async function checkSubscriptions(options: LifecycleOptions): Promise<void> {
  const { db, client, clock, checkIntervalMs } = options;
  const [runtime] = await db
    .select()
    .from(discordRuntime)
    .where(eq(discordRuntime.tokenFingerprint, client.tokenFingerprint));
  if (runtime?.paused || (runtime?.blockedUntil && runtime.blockedUntil > clock())) return;
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
    .limit(25);
  for (const subscription of due) {
    if (options.signal?.aborted) return;
    const [currentRuntime] = await db
      .select()
      .from(discordRuntime)
      .where(eq(discordRuntime.tokenFingerprint, client.tokenFingerprint));
    if (
      currentRuntime?.paused ||
      (currentRuntime?.blockedUntil && currentRuntime.blockedUntil > clock())
    )
      return;
    const token = crypto.randomUUID();
    const claimed = await db
      .update(discordSubscriptions)
      .set({ checkToken: token, checkExpiresAt: new Date(clock().getTime() + 60000) })
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
        nextCheckAt: new Date(
          clock().getTime() +
            (outcome.kind === "retry"
              ? outcome.retryAfterMs
              : outcome.kind === "unknown"
                ? 3600000
                : checkIntervalMs),
        ),
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
