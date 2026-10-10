import { t } from "elysia";

const Snowflake = t.String({ pattern: "^\\d{1,20}$" });
const OptionSchema = t.Object({
  name: t.String(),
  type: t.Number(),
  value: t.Optional(t.Union([t.String(), t.Boolean(), t.Number()])),
});
export const CommandSchema = t.Object({
  id: Snowflake,
  application_id: Snowflake,
  type: t.Literal(2),
  token: t.String({ minLength: 1 }),
  guild_id: Snowflake,
  member: t.Object({ permissions: t.String({ pattern: "^\\d+$" }) }),
  data: t.Object({
    name: t.Literal("claim"),
    options: t.Array(
      t.Object({
        name: t.Union([t.Literal("setup"), t.Literal("status"), t.Literal("stop")]),
        type: t.Literal(1),
        options: t.Optional(t.Array(OptionSchema)),
      }),
      { minItems: 1, maxItems: 1 },
    ),
  }),
});
export type DiscordCommand = typeof CommandSchema.static;
export type DiscordMessage = {
  content?: string;
  allowed_mentions: { parse: readonly [] };
  nonce?: string;
  enforce_nonce?: boolean;
  embeds?: {
    title: string;
    url: string;
    description: string;
    image?: { url: string };
    fields?: { name: string; value: string }[];
    footer?: { text: string };
  }[];
};
