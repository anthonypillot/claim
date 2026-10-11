import { and, eq, gt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import type { Database } from "../../db/client.ts";
import { discordRateLimits, discordRuntime } from "../../db/schema.ts";

export function createDiscordRateLimits(
  getDatabase: () => Database,
  tokenFingerprint: string,
  clock: () => Date,
) {
  function bucketHash(path: string): string {
    // Conservatively share limits across a channel/guild's routes. Never persist raw paths/IDs.
    const resourcePath = /^\/(channels|guilds)\/\d{1,20}(?:\/|$)/
      .exec(path)?.[0]
      .replace(/\/$/, "");

    return createHash("sha256")
      .update(`${tokenFingerprint}:${resourcePath ?? path}`)
      .digest("hex");
  }

  async function check(path: string): Promise<Response | null> {
    const db = getDatabase();
    await db.insert(discordRuntime).values({ tokenFingerprint }).onConflictDoNothing();

    const [runtime] = await db
      .select()
      .from(discordRuntime)
      .where(eq(discordRuntime.tokenFingerprint, tokenFingerprint));
    if (runtime?.paused) return new Response(null, { status: 401 });

    const [bucket] = await db
      .select()
      .from(discordRateLimits)
      .where(
        and(
          eq(discordRateLimits.bucketHash, bucketHash(path)),
          gt(discordRateLimits.blockedUntil, clock()),
        ),
      );

    const isGloballyLimited = Boolean(runtime?.blockedUntil && runtime.blockedUntil > clock());
    const blockedUntil =
      isGloballyLimited && runtime?.blockedUntil ? runtime.blockedUntil : bucket?.blockedUntil;
    if (!blockedUntil) return null;

    return Response.json(
      {
        retry_after: Math.max(1, (blockedUntil.getTime() - clock().getTime()) / 1000),
        global: isGloballyLimited,
      },
      { status: 429 },
    );
  }

  async function postpone(path: string, milliseconds: number, global: boolean): Promise<void> {
    const db = getDatabase();
    const until = new Date(clock().getTime() + milliseconds);
    const hash = bucketHash(path);

    await db.transaction(async (tx) => {
      if (global) {
        await tx
          .update(discordRuntime)
          .set({ blockedUntil: sql`greatest(${discordRuntime.blockedUntil}, ${until})` })
          .where(eq(discordRuntime.tokenFingerprint, tokenFingerprint));
      }

      await tx
        .insert(discordRateLimits)
        .values({ bucketHash: hash, blockedUntil: until })
        .onConflictDoUpdate({
          target: discordRateLimits.bucketHash,
          set: { blockedUntil: sql`greatest(${discordRateLimits.blockedUntil}, ${until})` },
        });
    });
  }

  async function pause(): Promise<void> {
    await getDatabase()
      .update(discordRuntime)
      .set({ paused: true })
      .where(eq(discordRuntime.tokenFingerprint, tokenFingerprint));
  }

  return { check, postpone, pause };
}
