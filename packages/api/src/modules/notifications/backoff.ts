import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../../db/client.ts";
import { discordSubscriptions } from "../../db/schema.ts";

type DestinationBackoff = {
  db: Database;
  guildId: string;
  channelId: string;
  until: Date;
};

export async function recordDestinationBackoff(backoff: DestinationBackoff): Promise<void> {
  const { db, guildId, channelId, until } = backoff;
  // Preserve the longest embargo, including out-of-order responses from other replicas.
  await db
    .update(discordSubscriptions)
    .set({ deliveryAfter: sql`greatest(${discordSubscriptions.deliveryAfter}, ${until})` })
    .where(
      and(eq(discordSubscriptions.guildId, guildId), eq(discordSubscriptions.channelId, channelId)),
    );
}
