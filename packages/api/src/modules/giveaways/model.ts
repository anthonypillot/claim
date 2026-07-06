import { t } from "elysia";

export const GiveawaysQuerySchema = t.Object({
  locale: t.String({
    pattern: "^[a-z]{2}(-[A-Za-z]{2,4})?$",
    default: "en-US",
    description: "BCP 47 language tag; drives title/description language",
    examples: ["en-US", "fr-FR"],
  }),
  country: t.String({
    pattern: "^[A-Za-z]{2}$",
    default: "US",
    description: "ISO 3166-1 alpha-2 country; drives pricing currency and regional availability",
    examples: ["FR", "US"],
  }),
});

export const GiveawaySchema = t.Object({
  id: t.String({ description: "Store offer identifier" }),
  title: t.String(),
  description: t.String(),
  url: t.Nullable(t.String({ description: "Store page URL" })),
  imageUrl: t.Nullable(t.String()),
  seller: t.String(),
  price: t.Object({
    original: t.Integer({ description: "Original price in the smallest currency unit (cents)" }),
    formatted: t.String({ description: "Human-readable original price, e.g. €35.99" }),
    currency: t.String({ description: "ISO 4217 currency code" }),
  }),
  freeUntil: t.String({ description: "End of the giveaway window, ISO 8601" }),
});

export const GiveawaysResponseSchema = t.Object({
  store: t.Literal("epic-games"),
  count: t.Integer(),
  giveaways: t.Array(GiveawaySchema),
});

export const ErrorResponseSchema = t.Object({
  error: t.String(),
});

export type Giveaway = typeof GiveawaySchema.static;
export type GiveawaysResponse = typeof GiveawaysResponseSchema.static;
