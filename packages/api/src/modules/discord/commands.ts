import { createHash } from "node:crypto";

import type { Database } from "../../db/client.ts";
import { discordInteractions } from "../../db/schema.ts";
import { createSubscriptions } from "../subscriptions/index.ts";
import { STORE_IDS, type StoreId } from "../giveaways/model.ts";
import { recordDestinationBackoff } from "../notifications/backoff.ts";
import type { DiscordClient } from "./client.ts";
import type { DiscordCommand } from "./model.ts";

export function createDiscordCommands(getDatabase: () => Database, client: DiscordClient) {
  const subscriptions = createSubscriptions(getDatabase, {
    tokenFingerprint: client.tokenFingerprint,
  });
  async function run(command: DiscordCommand): Promise<void> {
    const inserted = await getDatabase()
      .insert(discordInteractions)
      .values({
        hash: createHash("sha256").update(command.id).digest("hex"),
        expiresAt: new Date(Date.now() + 600000),
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) return;
    const subcommand = command.data.options[0];
    if (!subcommand) return;
    let content: string;
    const french =
      subcommand.options?.find((option) => option.name === "market")?.value === "fr-FR";
    if (subcommand.name === "setup") {
      const channel = subcommand.options?.find((option) => option.name === "channel")?.value;
      if (typeof channel !== "string" || !/^\d{1,20}$/.test(channel)) {
        await client.reply(command.token, "Select an ordinary text channel.");
        return;
      }
      if (!(await client.validateDestination(command.guild_id, channel))) {
        await client.reply(
          command.token,
          "Discord could not validate this text channel. Check server ownership and View Channel, Send Messages, Embed Links permissions, or try again after the current Discord error/rate limit.",
        );
        return;
      }
      const selection =
        subcommand.options?.find((option) => option.name === "stores")?.value ?? "all";
      const market =
        subcommand.options?.find((option) => option.name === "market")?.value ?? "en-US";
      const stores: StoreId[] = [];
      if (typeof selection !== "string" || (market !== "en-US" && market !== "fr-FR")) {
        await client.reply(command.token, "Choose a supported Store selection and market.");
        return;
      }
      if (selection !== "all")
        for (const value of selection.split(",").map((entry) => entry.trim())) {
          const store = STORE_IDS.find((id) => id === value);
          if (!store) {
            await client.reply(
              command.token,
              `Stores: all or a comma-separated non-empty selection of ${STORE_IDS.join(", ")}.`,
            );
            return;
          }
          if (!stores.includes(store)) stores.push(store);
        }
      await subscriptions.setup(command.guild_id, {
        channelId: channel,
        locale: french ? "fr-FR" : "en-US",
        country: french ? "FR" : "US",
        stores: selection === "all" ? null : stores,
      });
      const confirmation = french
        ? `Alertes Claim activées. Français/France ; ${selection === "all" ? "toutes les boutiques" : stores.join(", ")}. Nouvelles offres détectées uniquement, après la référence initiale de chaque boutique.`
        : `Claim alerts enabled. English/US; ${selection === "all" ? "all Stores" : stores.join(", ")}. Future discoveries only, after each Store baseline.`;
      const outcome = await client.send(channel, {
        content: confirmation,
        allowed_mentions: { parse: [] },
        nonce: createHash("sha256")
          .update(command.id + channel)
          .digest("hex")
          .slice(0, 25),
        enforce_nonce: true,
      });
      if (outcome.kind === "retry" || (outcome.kind === "sent" && outcome.retryAfterMs > 0))
        await recordDestinationBackoff({
          db: getDatabase(),
          guildId: command.guild_id,
          channelId: channel,
          until: new Date(Date.now() + outcome.retryAfterMs),
        });
      content =
        outcome.kind === "sent"
          ? french
            ? "Configuration enregistrée."
            : "Setup saved."
          : "Setup saved, but its confirmation could not be confirmed. Use /claim status; uncertain confirmations are not resent.";
    } else if (subcommand.name === "stop") {
      await subscriptions.stop(command.guild_id);
      content =
        "Stopped. Server configuration and diagnostics deleted; existing messages are unchanged.";
    } else content = await subscriptions.status(command.guild_id);
    await client.reply(command.token, content);
  }
  return { run };
}
export type DiscordCommands = ReturnType<typeof createDiscordCommands>;
