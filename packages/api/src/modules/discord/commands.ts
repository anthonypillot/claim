import { createHash } from "node:crypto";

import type { Database } from "../../db/client.ts";
import { discordInteractions } from "../../db/schema.ts";
import { createSubscriptions, type SubscriptionSettings } from "../subscriptions/index.ts";
import { STORE_IDS, type StoreId } from "../giveaways/model.ts";
import { recordDestinationBackoff } from "../notifications/backoff.ts";
import type { DiscordClient, SendOutcome } from "./client.ts";
import type { DiscordCommand } from "./model.ts";

const INTERACTION_REPLAY_RETENTION_MS = 10 * 60 * 1000;
const CONFIRMATION_NONCE_LENGTH = 25;

type Subcommand = DiscordCommand["data"]["options"][number];

type SetupSettingsResult = { settings: SubscriptionSettings } | { error: string };

function optionValue(subcommand: Subcommand, name: string) {
  return subcommand.options?.find((option) => option.name === name)?.value;
}

function parseSetupSettings(subcommand: Subcommand, channelId: string): SetupSettingsResult {
  const selection = optionValue(subcommand, "stores") ?? "all";
  const market = optionValue(subcommand, "market") ?? "en-US";

  if (typeof selection !== "string" || (market !== "en-US" && market !== "fr-FR")) {
    return { error: "Choose a supported Store selection and market." };
  }

  const stores: StoreId[] = [];

  if (selection !== "all") {
    const selectedStores = selection.split(",").map((value) => value.trim());

    for (const value of selectedStores) {
      const store = STORE_IDS.find((id) => id === value);

      if (!store) {
        return {
          error: `Stores: all or a comma-separated non-empty selection of ${STORE_IDS.join(", ")}.`,
        };
      }

      if (!stores.includes(store)) stores.push(store);
    }
  }

  return {
    settings: {
      channelId,
      locale: market,
      country: market === "fr-FR" ? "FR" : "US",
      stores: selection === "all" ? null : stores,
    },
  };
}

function setupConfirmation(settings: SubscriptionSettings): string {
  const french = settings.locale === "fr-FR";
  const stores = settings.stores?.join(", ") ?? (french ? "toutes les boutiques" : "all Stores");

  if (french) {
    return (
      `Alertes Claim activées. Français/France ; ${stores}. ` +
      "Nouvelles offres détectées uniquement, après la référence initiale de chaque boutique."
    );
  }

  return (
    `Claim alerts enabled. English/US; ${stores}. ` +
    "Future discoveries only, after each Store baseline."
  );
}

function setupReply(settings: SubscriptionSettings, outcome: SendOutcome): string {
  if (outcome.kind !== "sent") {
    return (
      "Setup saved, but its confirmation could not be confirmed. " +
      "Use /claim status; uncertain confirmations are not resent."
    );
  }

  return settings.locale === "fr-FR" ? "Configuration enregistrée." : "Setup saved.";
}

export function createDiscordCommands(getDatabase: () => Database, client: DiscordClient) {
  const subscriptions = createSubscriptions(getDatabase, {
    tokenFingerprint: client.tokenFingerprint,
  });

  async function claimInteraction(interactionId: string): Promise<boolean> {
    const inserted = await getDatabase()
      .insert(discordInteractions)
      .values({
        hash: createHash("sha256").update(interactionId).digest("hex"),
        expiresAt: new Date(Date.now() + INTERACTION_REPLAY_RETENTION_MS),
      })
      .onConflictDoNothing()
      .returning();

    return inserted.length > 0;
  }

  async function setup(command: DiscordCommand, subcommand: Subcommand): Promise<string> {
    const channelId = optionValue(subcommand, "channel");
    if (typeof channelId !== "string" || !/^\d{1,20}$/.test(channelId)) {
      return "Select an ordinary text channel.";
    }

    if (!(await client.validateDestination(command.guild_id, channelId))) {
      return (
        "Discord could not validate this text channel. Check server ownership and " +
        "View Channel, Send Messages, Embed Links permissions, or try again after the current " +
        "Discord error/rate limit."
      );
    }

    const parsed = parseSetupSettings(subcommand, channelId);
    if ("error" in parsed) return parsed.error;

    const { settings } = parsed;
    await subscriptions.setup(command.guild_id, settings);

    const outcome = await client.send(channelId, {
      content: setupConfirmation(settings),
      allowed_mentions: { parse: [] },
      nonce: createHash("sha256")
        .update(command.id + channelId)
        .digest("hex")
        .slice(0, CONFIRMATION_NONCE_LENGTH),
      enforce_nonce: true,
    });

    if (outcome.kind === "retry" || (outcome.kind === "sent" && outcome.retryAfterMs > 0)) {
      await recordDestinationBackoff({
        db: getDatabase(),
        guildId: command.guild_id,
        channelId,
        until: new Date(Date.now() + outcome.retryAfterMs),
      });
    }

    return setupReply(settings, outcome);
  }

  async function run(command: DiscordCommand): Promise<void> {
    if (!(await claimInteraction(command.id))) return;

    const subcommand = command.data.options[0];
    if (!subcommand) return;

    let content: string;
    switch (subcommand.name) {
      case "setup":
        content = await setup(command, subcommand);
        break;
      case "stop":
        await subscriptions.stop(command.guild_id);
        content =
          "Stopped. Server configuration and diagnostics deleted; existing messages are unchanged.";
        break;
      case "status":
        content = await subscriptions.status(command.guild_id);
        break;
    }

    await client.reply(command.token, content);
  }

  return { run };
}

export type DiscordCommands = ReturnType<typeof createDiscordCommands>;
