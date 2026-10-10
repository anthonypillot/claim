import { createHash } from "node:crypto";

import type { GiveawayRow } from "../../db/schema.ts";
import type { DiscordMessage } from "../discord/model.ts";
import { STORE_IDS, type StoreId } from "../giveaways/model.ts";
import { normalizeExternalUrl } from "../giveaways/stores/shared.ts";

const storeNames = {
  "epic-games": "Epic Games",
  "prime-gaming": "Prime Gaming",
  gog: "GOG",
  steam: "Steam",
} satisfies Record<StoreId, string>;
type AlertMessageOptions = {
  game: GiveawayRow;
  deliveryId: string;
  channelId: string;
  webUrl: string;
};

export function createAlertMessage(options: AlertMessageOptions): DiscordMessage {
  const { game, deliveryId, channelId, webUrl } = options;
  const french = game.locale === "fr-FR";
  const store = STORE_IDS.find((id) => id === game.store);
  const fallback = new URL("/", webUrl);
  fallback.searchParams.set("store", store ?? "all");
  const url = normalizeExternalUrl(game.url);
  const image = normalizeExternalUrl(game.imageWide ?? game.imageThumbnail ?? game.imageTall);
  const prime =
    store === "prime-gaming"
      ? french
        ? "\nAbonnement Prime requis."
        : "\nPrime membership required."
      : "";
  return {
    allowed_mentions: { parse: [] },
    nonce: createHash("sha256")
      .update(deliveryId + channelId)
      .digest("hex")
      .slice(0, 25),
    enforce_nonce: true,
    embeds: [
      {
        title:
          Array.from(game.title)
            .filter((character) => character.charCodeAt(0) >= 32)
            .join("")
            .slice(0, 256) || (french ? "Jeu offert" : "Giveaway"),
        url: url && url.length <= 2048 ? url : fallback.href,
        description: `${store ? storeNames[store] : "Claim"} · ${french ? "Fin" : "Ends"} <t:${Math.floor(game.freeUntil.getTime() / 1000)}:F>${prime}`,
        ...(image && image.length <= 2048 ? { image: { url: image } } : {}),
        ...(game.priceFormatted
          ? {
              fields: [
                {
                  name: french ? "Prix d’origine" : "Original price",
                  value: game.priceFormatted.slice(0, 1024),
                },
              ],
            }
          : {}),
      },
    ],
  };
}
